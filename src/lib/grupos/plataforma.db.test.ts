// Grupos da plataforma e `criar_grupo` (0186), medidos no banco local
// (`npm run db:teste`).
//
// Criar grupo é ato da plataforma: só a chave de serviço executa
// `criar_grupo`, e o grupo nasce inteiro (taxas copiadas da Next Home,
// configuração fiscal vazia e o evento `grupo_criado`) ou não nasce.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  criarUsuario,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
} from "./apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "./grupo";
import { COLUNAS_PUBLICAS_DE_CORRETOR } from "@/lib/corretores/colunasPublicas";
import { ACAO_GRUPO_DESFEITO, ORDEM_DO_DESFAZER } from "@/lib/plataforma/desfazerGrupo";

/** Roda `fn` pela chave de serviço (papel `service_role`, como o PostgREST). */
function comoServico<T>(
  tx: Conexao,
  userId: string,
  fn: (s: TransactionSql) => Promise<T>,
): Promise<T> {
  return comoUsuario(tx, userId, async (eu) => {
    await eu`reset role`;
    await eu`set local role service_role`;
    await eu`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
    return fn(eu);
  });
}

const CONTATO = {
  nome: "Ana Silva",
  email: "ana@imobiliariasilva.com.br",
  telefone: "11999990000",
};

describe.skipIf(!process.env.DB_TESTE_URL)("grupos da plataforma (0186, 0187)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("criar_grupo cria grupo, taxas e fiscal", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const operador = await criarUsuario(tx, "operador@plataforma.teste");

      // `comoServico` desfaz tudo ao sair: a conferência roda dentro dele,
      // de volta ao papel `postgres` (que lê sem RLS).
      await comoServico(tx, operador, async (s) => {
        const [{ id }] = await s<{ id: string }[]>`
        select public.criar_grupo(
          'Imobiliária Silva', 'imobiliaria-silva', 'imobiliaria', 'profissional',
          ${s.json(CONTATO)}, ${operador}
        ) as id
      `;
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        await s`reset role`;

        const [grupo] = await s`
        select nome, slug, tipo, plano, situacao, criado_por,
               contato_cobranca_nome, contato_cobranca_email, contato_cobranca_telefone
          from public.grupos where id = ${id}
      `;
        expect(grupo).toEqual({
          nome: "Imobiliária Silva",
          slug: "imobiliaria-silva",
          tipo: "imobiliaria",
          plano: "profissional",
          situacao: "ativo",
          criado_por: operador,
          contato_cobranca_nome: CONTATO.nome,
          contato_cobranca_email: CONTATO.email,
          contato_cobranca_telefone: CONTATO.telefone,
        });

        // As taxas do grupo novo são a cópia das da Next Home.
        const taxas = await s`
        select g.grupo_id = ${id} as do_novo,
               g.faixas = n.faixas and g.teto_fgts_imovel = n.teto_fgts_imovel
               and g.taxa_sbpe_anual = n.taxa_sbpe_anual and g.prazo_maximo_meses = n.prazo_maximo_meses
               and g.comprometimento_maximo = n.comprometimento_maximo
               and g.itbi_por_cidade = n.itbi_por_cidade and g.conferido_em = n.conferido_em as iguais,
               g.conferido_por
          from public.parametros_credito g
          cross join public.parametros_credito n
         where g.grupo_id = ${id} and n.grupo_id = ${GRUPO_NEXT_HOME_ID}
      `;
        expect(taxas).toEqual([{ do_novo: true, iguais: true, conferido_por: null }]);

        const fiscal =
          await s`select cnpj, razao_social from public.fiscal_config where grupo_id = ${id}`;
        expect(fiscal).toEqual([{ cnpj: null, razao_social: null }]);

        const eventos = await s`
        select acao, grupo_id, ator_id, ator_plataforma_user_id, detalhes ->> 'origem' as origem,
               detalhes ->> 'slug' as slug
          from public.admin_eventos where grupo_id = ${id}
      `;
        expect(eventos).toEqual([
          {
            acao: "grupo_criado",
            grupo_id: id,
            ator_id: null,
            ator_plataforma_user_id: operador,
            origem: "plataforma",
            slug: "imobiliaria-silva",
          },
        ]);
      });
    });
  });

  // Task 6: o caminho da tela de "novo grupo" (`criarGrupoComPrimeiroAcesso`)
  // pela chave de serviço — grupo, ficha do primeiro acesso como gestora e,
  // se o convite falha, o desfazer na ordem das chaves estrangeiras.
  it("grupo criado pela plataforma tem taxas e fiscal", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const operador = await criarUsuario(tx, "operador@plataforma.teste");
      const convidado = await criarUsuario(tx, "ana@independente.teste");

      await comoServico(tx, operador, async (s) => {
        const [{ id }] = await s<{ id: string }[]>`
          select public.criar_grupo(
            'Ana Corretora', 'ana-corretora', 'independente', 'essencial',
            ${s.json({ nome: "Ana", email: "ana@independente.teste", telefone: "5511987654321" })}, ${operador}
          ) as id
        `;
        // A ficha nasce pela chave de serviço, com o grupo explícito (sem
        // sessão, o gatilho não teria de onde tirá-lo).
        const [ficha] = await s<{ id: string; grupo_id: string; papel: string }[]>`
          insert into public.corretores (nome, creci, whatsapp, slug, ativo, papel, grupo_id)
          values ('Ana', '12345-F', '5511987654321', 'ana-corretora-ficha', true, 'gestor', ${id})
          returning id, grupo_id, papel
        `;
        expect(ficha).toMatchObject({ grupo_id: id, papel: "gestor" });
        await s`update public.corretores set user_id = ${convidado} where id = ${ficha.id} and grupo_id = ${id}`;
        await s`reset role`;

        const [taxas] = await s`select count(*)::int as n from public.parametros_credito where grupo_id = ${id}`;
        const [fiscal] = await s`select count(*)::int as n from public.fiscal_config where grupo_id = ${id}`;
        expect({ taxas: taxas.n, fiscal: fiscal.n }).toEqual({ taxas: 1, fiscal: 1 });

        // Independente é gestor do próprio grupo (§18): a sessão dele diz isso.
        const [eu] = await comoUsuario(s, convidado, (u) => u`
          select public.eh_gestor() as gestor, public.grupo_atual() = ${id} as do_grupo
        `);
        expect(eu).toEqual({ gestor: true, do_grupo: true });
      });
    });
  });

  it("desfazer o grupo criado libera o endereço", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const operador = await criarUsuario(tx, "operador@plataforma.teste");

      await comoServico(tx, operador, async (s) => {
        const criar = () => s<{ id: string }[]>`
          select public.criar_grupo(
            'Imobiliária Silva', 'imobiliaria-silva', 'imobiliaria', 'profissional', '{}'::jsonb, ${operador}
          ) as id
        `;
        const [{ id }] = await criar();
        await s`
          insert into public.corretores (nome, creci, whatsapp, slug, ativo, papel, grupo_id)
          values ('Ana', '12345', '5511987654321', 'ana-silva-desfazer', true, 'gestor', ${id})
        `;

        // O grupo não sai antes das linhas dele: nenhuma chave estrangeira
        // para `grupos` apaga em cascata.
        await expect(s.savepoint((sp) => sp`delete from public.grupos where id = ${id}`)).rejects.toThrow(
          /foreign key/,
        );

        // A MESMA constante que `desfazerGrupo` (src/app/plataforma/acoes.ts)
        // percorre: se `criar_grupo` passar a gravar outra tabela, este
        // teste quebra no delete do grupo, e a action junto com ele.
        let apagados: unknown[] = [];
        for (const { tabela, coluna } of ORDEM_DO_DESFAZER) {
          apagados = await s.unsafe(`delete from public.${tabela} where ${coluna} = $1 returning 1`, [id]);
        }
        expect(ORDEM_DO_DESFAZER.at(-1)).toEqual({ tabela: "grupos", coluna: "id" });
        expect(apagados).toHaveLength(1);

        // O evento que fica: da plataforma, sem grupo, pela chave de serviço.
        const [evento] = await s`
          insert into public.admin_eventos (grupo_id, acao, ator_plataforma_user_id, detalhes)
          values (null, ${ACAO_GRUPO_DESFEITO}, ${operador},
                  ${s.json({ origem: "plataforma", slug: "imobiliaria-silva", passo: "convite", desfeito: true })})
          returning grupo_id, acao
        `;
        expect(evento).toEqual({ grupo_id: null, acao: "grupo_desfeito" });

        const [{ id: deNovo }] = await criar();
        expect(deNovo).not.toBe(id);
      });
    });
  });

  it("criar_grupo recusa slug reservado, fora do formato e repetido", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const operador = await criarUsuario(tx, "operador@plataforma.teste");
      await criarGrupo(tx, { slug: "ja-existe" });

      const tentar = (slug: string) =>
        comoServico(
          tx,
          operador,
          (s) => s`
          select public.criar_grupo('Grupo', ${slug}, 'imobiliaria', 'essencial', '{}'::jsonb, ${operador})
        `,
        );

      await expect(tentar("www")).rejects.toThrow(/slug reservado/);
      await expect(tentar("plataforma")).rejects.toThrow(/slug reservado/);
      await expect(tentar("Maiuscula")).rejects.toThrow(/slug fora do formato/);
      await expect(tentar("x")).rejects.toThrow(/slug fora do formato/);
      await expect(tentar("-hifen")).rejects.toThrow(/slug fora do formato/);
      await expect(tentar("ja-existe")).rejects.toThrow(/slug em uso/);

      // A tabela recusa também, para quem gravar por fora da função.
      await expect(
        tx.savepoint(
          (sp) =>
            sp`insert into public.grupos (nome, slug, tipo) values ('X', 'Com Espaco', 'imobiliaria')`,
        ),
      ).rejects.toThrow(/grupos_slug_check/);
    });
  });

  it("logado não executa criar_grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "grupo-b" });
      await expect(
        comoUsuario(
          tx,
          b.gestorUserId,
          (eu) => eu`
          select public.criar_grupo('Grupo', 'grupo-c', 'imobiliaria', 'essencial', '{}'::jsonb, ${b.gestorUserId})
        `,
        ),
      ).rejects.toThrow(/permission denied/);

      const [{ anon, autenticado, servico }] = await tx`
        select has_function_privilege('anon', 'public.criar_grupo(text, text, text, text, jsonb, uuid)', 'execute') as anon,
               has_function_privilege('authenticated', 'public.criar_grupo(text, text, text, text, jsonb, uuid)', 'execute') as autenticado,
               has_function_privilege('service_role', 'public.criar_grupo(text, text, text, text, jsonb, uuid)', 'execute') as servico
      `;
      expect({ anon, autenticado, servico }).toEqual({
        anon: false,
        autenticado: false,
        servico: true,
      });
    });
  });

  it("grupo 1 está no plano custo", async () => {
    const [grupo] =
      await sql`select plano, situacao from public.grupos where id = ${GRUPO_NEXT_HOME_ID}`;
    expect(grupo).toEqual({ plano: "custo", situacao: "ativo" });
  });

  it("evento com acao nova é aceito", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "grupo-b" });
      for (const acao of [
        "grupo_criado",
        "grupo_desfeito",
        "convite_enviado",
        "convite_reenviado",
        "email_alterado",
        "link_de_senha_enviado",
        "conta_criada",
        "numero_desconectado",
      ]) {
        const [linha] = await tx`
          insert into public.admin_eventos (acao, alvo_corretor_id, detalhes)
          values (${acao}, ${b.corretorId}, '{}'::jsonb)
          returning acao
        `;
        expect(linha.acao).toBe(acao);
      }
      await expect(
        tx.savepoint(
          (sp) => sp`
          insert into public.admin_eventos (acao, alvo_corretor_id, detalhes)
          values ('acao_inventada', ${b.corretorId}, '{}'::jsonb)
        `,
        ),
      ).rejects.toThrow(/admin_eventos_acao_check/);
    });
  });

  it("colunas novas de grupos não ganham escrita para o logado", async () => {
    const linhas = await sql<{ coluna: string; privilegio: string }[]>`
      select column_name as coluna, privilege_type as privilegio
        from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'grupos'
         and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'
    `;
    expect(linhas).toEqual([]);
    const [{ escreve }] = await sql`
      select has_table_privilege('authenticated', 'public.grupos', 'insert')
          or has_table_privilege('authenticated', 'public.grupos', 'update')
          or has_table_privilege('authenticated', 'public.grupos', 'delete') as escreve
    `;
    expect(escreve).toBe(false);
  });

  // 0187: com e-mail REAL na ficha (fase 2), a chave pública só lê as colunas
  // que o site mostra. `authenticated` não muda nesta migration.
  it("anon não lê email de corretores", async () => {
    for (const coluna of ["email", "user_id", "deve_trocar_senha"]) {
      await emTransacaoDesfeita(sql, async (tx) => {
        await tx`set local role anon`;
        await expect(tx.unsafe(`select ${coluna} from public.corretores`)).rejects.toThrow(
          /permission denied/,
        );
      });
    }
    await emTransacaoDesfeita(sql, async (tx) => {
      await tx`set local role anon`;
      await expect(tx`select * from public.corretores`).rejects.toThrow(/permission denied/);
    });
  });

  it("anon lê a lista pública", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "grupo-b" });
      const linhas = await tx.savepoint(async (s) => {
        await s`set local role anon`;
        // A mesma consulta de `corretoresPublicos` (catalogo/cache.ts).
        return s.unsafe(
          `select ${COLUNAS_PUBLICAS_DE_CORRETOR} from public.corretores
            where grupo_id = $1 and ativo and slug is not null order by nome`,
          [b.grupoId],
        );
      });
      expect(linhas.map((l) => l.nome)).toEqual(["corretor grupo-b", "gestor grupo-b"]);
      expect(Object.keys(linhas[0]).sort()).toEqual(
        COLUNAS_PUBLICAS_DE_CORRETOR.split(",").map((c) => c.trim()).sort(),
      );
    });
    const [{ logado }] = await sql`
      select has_column_privilege('authenticated', 'public.corretores', 'email', 'select') as logado
    `;
    expect(logado).toBe(true);
  });

  // Mesma migration: as colunas da 0186 (documento, cobrança, LGPD) são da
  // plataforma, não de todo corretor do grupo. O logado lê só o básico.
  it("corretor lê tipo do grupo e não lê documento", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "grupo-b" });
      const [grupo] = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu`select id, nome, slug, tipo, plano, situacao, criado_em from public.grupos`,
      );
      expect(grupo).toMatchObject({ id: b.grupoId, tipo: "imobiliaria", situacao: "ativo" });
      for (const coluna of [
        "documento",
        "razao_social",
        "contato_cobranca_email",
        "contato_cobranca_telefone",
        "encarregado_lgpd_email",
        "criado_por",
      ]) {
        await expect(
          comoUsuario(tx, b.corretorUserId, (eu) => eu.unsafe(`select ${coluna} from public.grupos`)),
        ).rejects.toThrow(/permission denied/);
      }
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) => eu`select * from public.grupos`),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
