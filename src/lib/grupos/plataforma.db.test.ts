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

describe.skipIf(!process.env.DB_TESTE_URL)("grupos da plataforma (0186)", () => {
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
});
