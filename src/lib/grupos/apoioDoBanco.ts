// Apoio dos testes de banco (`*.db.test.ts`).
//
// Só roda contra o banco LOCAL de `npm run db:teste` (DB_TESTE_URL). Nunca
// aponte DB_TESTE_URL para produção: `criarUsuario` e `criarGrupo` escrevem
// em `auth.users` e em `corretores` como `postgres`, que ignora RLS.
//
// Regra da suíte: cada teste roda dentro de uma transação desfeita no fim
// (`emTransacaoDesfeita`), e os ajudantes recebem essa transação. Nada vaza
// de um teste para o outro, e por isso o mesmo banco serve ao cenário "com
// um grupo só" e ao cenário "com dois grupos".

import postgres, { type Sql, type TransactionSql } from "postgres";

/** A conexão crua ou uma transação aberta nela. */
export type Conexao = Sql | TransactionSql;

/**
 * Conexão com o banco de teste.
 *
 * Os avisos do Postgres (`raise notice`/`raise warning`) iriam para o console
 * de todo teste, então são descartados por padrão. Quem precisa afirmar um
 * aviso (o do grupo único, por exemplo) passa `avisos`, e cada mensagem é
 * acrescentada ali. O aviso é da CONEXÃO, então o teste que o lê abre a
 * própria e a fecha no fim.
 */
export function conectar({ avisos }: { avisos?: string[] } = {}): Sql {
  const url = process.env.DB_TESTE_URL;
  if (!url) {
    throw new Error("DB_TESTE_URL ausente. Suba o banco local com `npm run db:teste`.");
  }
  return postgres(url, {
    max: 1,
    onnotice: (aviso) => {
      avisos?.push(aviso.message);
    },
  });
}

/**
 * Chave da trava de sessão (`pg_advisory_lock`) que separa os arquivos de
 * teste que precisam gravar DE VERDADE (realtime.db.test.ts: o Realtime lê o
 * WAL, e transação desfeita nunca chega lá) dos que contam com o banco limpo
 * entre transações ("com um grupo só"). O vitest roda arquivos em paralelo.
 */
const TRAVA_DA_SUITE = 1_840_001;

/** Espera a vez da suíte. A trava é da sessão: dure o arquivo inteiro. */
export async function travarSuite(sql: Sql): Promise<void> {
  await sql`select pg_advisory_lock(${TRAVA_DA_SUITE})`;
}

/** Devolve a vez da suíte. */
export async function soltarSuite(sql: Sql): Promise<void> {
  await sql`select pg_advisory_unlock(${TRAVA_DA_SUITE})`;
}

/** Erro sentinela: lançado de dentro da transação só para desfazê-la. */
class Desfazer extends Error {}

/**
 * Abre uma transação (ou um savepoint, se `sql` já for uma transação), roda
 * `fn` e desfaz tudo no fim, devolvendo o que `fn` devolveu. Erro de `fn`
 * desfaz do mesmo jeito e sobe para o teste.
 */
async function desfazendo<T>(sql: Conexao, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  let resultado!: T;
  const corpo = async (tx: TransactionSql) => {
    resultado = await fn(tx);
    throw new Desfazer();
  };
  try {
    if ("savepoint" in sql) await sql.savepoint(corpo);
    else await sql.begin(corpo);
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }
  return resultado;
}

/** O corpo de um teste: tudo o que ele grava some no fim. */
export function emTransacaoDesfeita<T>(sql: Sql, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return desfazendo(sql, fn);
}

/**
 * Cria um login em `auth.users` + `auth.identities` pelo molde de uma linha
 * que o GoTrue aceita (MEMORIA, "Trocar o e-mail do Eduardo"): os tokens vão
 * como '' e não nulos, `confirmed_at` é gerada (não se insere), o hash usa
 * `extensions.crypt` com custo 10, e a identidade `email` não é opcional.
 * Devolve o id do usuário.
 */
export async function criarUsuario(sql: Conexao, email: string): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', ${email},
      extensions.crypt('senha-de-teste', extensions.gen_salt('bf', 10)),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    )
    returning id
  `;
  await sql`
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      ${id}, ${id},
      jsonb_build_object('sub', ${id}::text, 'email', ${email}::text, 'email_verified', true),
      'email', now(), now(), now()
    )
  `;
  return id;
}

/**
 * Roda `fn` como o usuário `userId` logado: papel `authenticated` e o JWT
 * com o `sub` dele, que é o que `auth.uid()` lê. Tudo é desfeito no fim,
 * inclusive o papel (SET LOCAL volta junto com o savepoint).
 */
export function comoUsuario<T>(
  sql: Conexao,
  userId: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  return desfazendo(sql, async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: userId,
      role: "authenticated",
    })}, true)`;
    return fn(tx);
  });
}

export type GrupoDeTeste = {
  grupoId: string;
  gestorUserId: string;
  gestorId: string;
  corretorUserId: string;
  corretorId: string;
};

/**
 * Cria um grupo com um gestor e um corretor, cada um com login. Roda como
 * `postgres` (o papel da chave de serviço), então passe a transação do
 * teste, nunca a de `comoUsuario`. `slug` precisa ser único no teste: ele
 * compõe o slug, o CRECI e o e-mail das duas pessoas.
 */
export async function criarGrupo(
  sql: Conexao,
  { nome, slug }: { nome?: string; slug: string },
): Promise<GrupoDeTeste> {
  const [{ id: grupoId }] = await sql<{ id: string }[]>`
    insert into public.grupos (nome, slug, tipo)
    values (${nome ?? `Grupo ${slug}`}, ${slug}, 'imobiliaria')
    returning id
  `;

  const pessoa = async (papel: "gestor" | "corretor") => {
    const userId = await criarUsuario(sql, `${papel}@${slug}.teste`);
    const [{ id }] = await sql<{ id: string }[]>`
      insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
      values (
        ${`${papel} ${slug}`}, ${`TESTE-${slug}-${papel}`}, '5511900000000',
        ${`${slug}-${papel}`}, ${papel}, ${userId}, ${grupoId}
      )
      returning id
    `;
    return { userId, id };
  };

  const gestor = await pessoa("gestor");
  const corretor = await pessoa("corretor");
  return {
    grupoId,
    gestorUserId: gestor.userId,
    gestorId: gestor.id,
    corretorUserId: corretor.userId,
    corretorId: corretor.id,
  };
}
