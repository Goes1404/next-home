// O tipo do grupo na sessão do painel (Task 7), medido no banco local
// (`npm run db:teste`).
//
// `getCorretorLogado` faz, pela sessão do logado, duas leituras em paralelo:
// a ficha (`corretores`, com `SELECT_CORRETOR, papel, ativo, grupo_id`) e o
// tipo do grupo (`grupos`, só `id, tipo` — `lerTipoDoGrupo`). A 0196 trocou o
// SELECT de tabela de `grupos` por SELECT de COLUNAS para `authenticated`:
// se a leitura do tipo pedisse uma coluna fora da lista, ela viria vazia e o
// grupo independente veria o menu de imobiliária, calado.
//
// O grupo nasce pelo mesmo caminho da plataforma: `criar_grupo` pela role
// `service_role`. Pula sem DB_TESTE_URL. Cada teste roda numa transação
// desfeita no fim.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarUsuario,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
} from "./apoioDoBanco";
import { SELECT_CORRETOR } from "@/lib/catalogo/selects";

/** Roda `fn` pela chave de serviço (papel `service_role`, como o PostgREST). */
function comoServico<T>(tx: Conexao, userId: string, fn: (s: TransactionSql) => Promise<T>): Promise<T> {
  return comoUsuario(tx, userId, async (eu) => {
    await eu`reset role`;
    await eu`set local role service_role`;
    await eu`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
    return fn(eu);
  });
}

/**
 * As colunas que `corretorSessao.ts` pede, lidas do PRÓPRIO código: se alguém
 * acrescentar à leitura do tipo uma coluna que a 0196 não libera, é este
 * teste que reprova — e não o menu do independente que vira o de
 * imobiliária, calado.
 */
const FONTE_DA_SESSAO = readFileSync(join(process.cwd(), "src/lib/corretorSessao.ts"), "utf8");
function colunas(lista: string): string[] {
  return lista.split(",").map((c) => c.trim()).filter(Boolean);
}
const SUFIXO_DA_FICHA = /\.from\("corretores"\)\s*\.select\(`\$\{SELECT_CORRETOR\},([^`]*)`\)/.exec(FONTE_DA_SESSAO)?.[1];
const LEITURA_DO_TIPO = /\.from\("grupos"\)\s*\.select\("([^"]+)"\)/.exec(FONTE_DA_SESSAO)?.[1];
const COLUNAS_DA_FICHA = [...colunas(SELECT_CORRETOR), ...colunas(SUFIXO_DA_FICHA ?? "")];
const COLUNAS_DO_TIPO = colunas(LEITURA_DO_TIPO ?? "");

describe.skipIf(!process.env.DB_TESTE_URL)("sessão do painel e o tipo do grupo (Task 7 × 0196)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("o teste lê as colunas do código (senão mede uma consulta que ninguém faz)", () => {
    expect(COLUNAS_DA_FICHA).toEqual(expect.arrayContaining(["slug", "papel", "ativo", "grupo_id"]));
    expect(COLUNAS_DO_TIPO).toEqual(expect.arrayContaining(["id", "tipo"]));
  });

  it("o gestor de um grupo independente lê o tipo do próprio grupo pela sessão", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const operador = await criarUsuario(tx, "operador@plataforma.teste");

      // `comoServico` desfaz ao sair: o cenário inteiro vive dentro dele.
      await comoServico(tx, operador, async (s) => {
        const [{ id: grupoId }] = await s<{ id: string }[]>`
          select public.criar_grupo(
            'Ana Corretora', 'ana-corretora', 'independente', 'essencial', '{}'::jsonb, ${operador}
          ) as id
        `;
        await s`reset role`;

        const gestorUserId = await criarUsuario(s, "ana@ana-corretora.teste");
        await s`
          insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
          values ('Ana', 'TESTE-ana', '5511900000000', 'ana-corretora-ana', 'gestor', ${gestorUserId}, ${grupoId})
        `;

        await comoUsuario(s, gestorUserId, async (eu) => {
          // A ficha, com as mesmas colunas da sessão.
          const fichas = await eu`
            select ${eu(COLUNAS_DA_FICHA)} from public.corretores where user_id = ${gestorUserId}
          `;
          expect(fichas).toHaveLength(1);
          expect(fichas[0]).toMatchObject({ slug: "ana-corretora-ana", papel: "gestor", ativo: true, grupo_id: grupoId });

          // O tipo, como `lerTipoDoGrupo`: sem filtro, a policy recorta a
          // linha do próprio grupo — exatamente uma.
          const grupos = await eu<{ id: string; tipo: string }[]>`
            select ${eu(COLUNAS_DO_TIPO)} from public.grupos
          `;
          expect(grupos).toEqual([{ id: grupoId, tipo: "independente" }]);
        });

        // A 0196 vale: o mesmo logado NÃO lê o cadastro de cobrança do grupo.
        // Prova de que a leitura acima passou por estar dentro das colunas
        // liberadas, e não por um SELECT de tabela que tivesse sobrado.
        await expect(
          comoUsuario(s, gestorUserId, (eu) => eu`select contato_cobranca_email from public.grupos`),
        ).rejects.toThrow(/permission denied/);
      });
    });
  });
});
