// A cota de respostas da IA (0197), medida no banco local (`npm run db:teste`).
//
// O contador mora no banco, num gatilho de `ia_interacoes`: conta só o que
// sai para o cliente no WhatsApp, no grupo da linha, no mês de São Paulo. E
// ninguém pela API lê nem escreve o contador: quem lê é o servidor.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
} from "@/lib/grupos/apoioDoBanco";

/** `ia_interacoes.corretor_id` não tem FK: o grupo vai explícito, como na conversa. */
async function interacao(
  tx: Conexao,
  grupo: { grupoId: string; corretorId: string },
  dados: { acao: string; origem: string; criadaEm?: string },
): Promise<void> {
  await tx`
    insert into public.ia_interacoes (grupo_id, corretor_id, origem, prompt_versao, acao, created_at)
    values (${grupo.grupoId}, ${grupo.corretorId}, ${dados.origem}, 'teste', ${dados.acao}, ${dados.criadaEm ?? new Date().toISOString()})
  `;
}

async function respostasDo(tx: Conexao, grupoId: string, mes: string): Promise<number> {
  const linhas = await tx<{ respostas: number }[]>`
    select respostas from public.uso_da_ia where grupo_id = ${grupoId} and mes = ${mes}::date
  `;
  return linhas[0]?.respostas ?? 0;
}

describe.skipIf(!process.env.DB_TESTE_URL)("cota de respostas da IA (0197)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("conta só as respostas ao cliente no WhatsApp, no grupo da linha", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cota-a" });
      const b = await criarGrupo(tx, { slug: "cota-b" });
      const quando = "2026-10-15T15:00:00Z";
      await interacao(tx, a, { acao: "respondida", origem: "webhook", criadaEm: quando });
      await interacao(tx, a, { acao: "visita_confirmada", origem: "webhook", criadaEm: quando });
      await interacao(tx, a, { acao: "respondida", origem: "followup", criadaEm: quando });
      await interacao(tx, a, { acao: "respondida", origem: "painel", criadaEm: quando });
      // Não contam: teste do corretor, consultor, silêncios e envio que falhou.
      await interacao(tx, a, { acao: "respondida", origem: "playground", criadaEm: quando });
      await interacao(tx, a, { acao: "respondida", origem: "consultor", criadaEm: quando });
      await interacao(tx, a, { acao: "cota_do_grupo", origem: "webhook", criadaEm: quando });
      await interacao(tx, a, { acao: "erro_envio", origem: "webhook", criadaEm: quando });
      await interacao(tx, b, { acao: "respondida", origem: "webhook", criadaEm: quando });

      expect(await respostasDo(tx, a.grupoId, "2026-10-01")).toBe(4);
      expect(await respostasDo(tx, b.grupoId, "2026-10-01")).toBe(1);
    });
  });

  it("o mês é o de São Paulo: 22h do dia 31 ainda conta no mês que acaba", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cota-fuso" });
      await interacao(tx, a, { acao: "respondida", origem: "webhook", criadaEm: "2026-11-01T01:00:00Z" });
      await interacao(tx, a, { acao: "respondida", origem: "webhook", criadaEm: "2026-11-01T04:00:00Z" });
      expect(await respostasDo(tx, a.grupoId, "2026-10-01")).toBe(1);
      expect(await respostasDo(tx, a.grupoId, "2026-11-01")).toBe(1);
    });
  });

  it("ninguém lê nem escreve o contador pela API, nem o gestor do próprio grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cota-api" });
      await interacao(tx, a, { acao: "respondida", origem: "webhook" });

      for (const userId of [a.gestorUserId, a.corretorUserId]) {
        await expect(comoUsuario(tx, userId, (eu) => eu`select * from public.uso_da_ia`)).rejects.toThrow(
          /permission denied/,
        );
        await expect(
          comoUsuario(tx, userId, (eu) => eu`update public.uso_da_ia set respostas = 0`),
        ).rejects.toThrow(/permission denied/);
      }

      const [privs] = await tx<{ anon: boolean; logado: boolean; teto: boolean }[]>`
        select has_table_privilege('anon', 'public.uso_da_ia', 'select') as anon,
               has_table_privilege('authenticated', 'public.uso_da_ia', 'select') as logado,
               has_column_privilege('authenticated', 'public.grupos', 'teto_respostas_ia', 'select') as teto
      `;
      expect(privs).toEqual({ anon: false, logado: false, teto: false });
    });
  });

  it("o gatilho não é chamável pela API e o contador só aceita dia 1º", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [p] = await tx<{ logado: boolean; anon: boolean }[]>`
        select has_function_privilege('authenticated', 'public.contar_resposta_da_ia()', 'execute') as logado,
               has_function_privilege('anon', 'public.contar_resposta_da_ia()', 'execute') as anon
      `;
      expect(p).toEqual({ logado: false, anon: false });

      const a = await criarGrupo(tx, { slug: "cota-dia" });
      await expect(
        tx.savepoint((sp) => sp`insert into public.uso_da_ia (grupo_id, mes) values (${a.grupoId}, '2026-10-15')`),
      ).rejects.toThrow(/check/);
    });
  });

  it("a plataforma ajusta o teto do grupo, e teto negativo é recusado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cota-teto" });
      await tx`update public.grupos set teto_respostas_ia = 300 where id = ${a.grupoId}`;
      const [g] = await tx<{ teto_respostas_ia: number }[]>`select teto_respostas_ia from public.grupos where id = ${a.grupoId}`;
      expect(g.teto_respostas_ia).toBe(300);
      await expect(
        tx.savepoint((sp) => sp`update public.grupos set teto_respostas_ia = -1 where id = ${a.grupoId}`),
      ).rejects.toThrow(/check/);
    });
  });
});
