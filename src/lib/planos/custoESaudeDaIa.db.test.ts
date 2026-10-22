// O custo e a saúde da IA por grupo (0211), medidos no banco local
// (`npm run db:teste`): as duas funções devolvem só agregados, por grupo, e o
// logado não as executa. Pula sem DB_TESTE_URL.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { conectar, criarGrupo, emTransacaoDesfeita, soltarSuite, travarSuite } from "@/lib/grupos/apoioDoBanco";

type Conexao = Parameters<Parameters<typeof emTransacaoDesfeita>[1]>[0];

async function interacao(
  tx: Conexao,
  g: { grupoId: string; corretorId: string },
  d: { acao: string; origem?: string; modelo?: string; entrada?: number; saida?: number; fallback?: boolean; criadaEm?: string },
): Promise<void> {
  await tx`
    insert into public.ia_interacoes (grupo_id, corretor_id, origem, prompt_versao, acao, modelo, tokens_entrada, tokens_saida, fallback, created_at)
    values (${g.grupoId}, ${g.corretorId}, ${d.origem ?? "webhook"}, 'teste', ${d.acao}, ${d.modelo ?? "gpt-4.1-mini"},
            ${d.entrada ?? null}, ${d.saida ?? null}, ${d.fallback ?? false}, ${d.criadaEm ?? new Date().toISOString()})
  `;
}

describe.skipIf(!process.env.DB_TESTE_URL)("custo e saúde da IA por grupo (0211)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("soma os tokens do mês por grupo e modelo, sem misturar grupos nem contar o mês anterior", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "custo-a" });
      const b = await criarGrupo(tx, { slug: "custo-b" });
      await interacao(tx, a, { acao: "respondida", entrada: 100, saida: 10, criadaEm: "2026-10-05T12:00:00Z" });
      await interacao(tx, a, { acao: "respondida", entrada: 200, saida: 20, criadaEm: "2026-10-06T12:00:00Z" });
      await interacao(tx, a, { acao: "respondida", modelo: "gemini-3.5-flash", entrada: 5, saida: 1, criadaEm: "2026-10-06T12:00:00Z" });
      await interacao(tx, a, { acao: "respondida", entrada: 999, saida: 999, criadaEm: "2026-09-30T12:00:00Z" });
      await interacao(tx, a, { acao: "silenciada_por_modo", criadaEm: "2026-10-06T12:00:00Z" }); // sem tokens
      await interacao(tx, b, { acao: "respondida", entrada: 7, saida: 3, criadaEm: "2026-10-07T12:00:00Z" });

      const linhas = await tx<{ grupo_id: string; modelo: string; interacoes: string; tokens_entrada: string; tokens_saida: string }[]>`
        select * from public.custo_da_ia_por_grupo('2026-10-01T03:00:00Z')
         where grupo_id in (${a.grupoId}, ${b.grupoId})
         order by grupo_id, modelo
      `;
      const de = (g: string, m: string) => linhas.find((l) => l.grupo_id === g && l.modelo === m);
      expect(Number(de(a.grupoId, "gpt-4.1-mini")?.tokens_entrada)).toBe(300);
      expect(Number(de(a.grupoId, "gpt-4.1-mini")?.tokens_saida)).toBe(30);
      expect(Number(de(a.grupoId, "gpt-4.1-mini")?.interacoes)).toBe(2);
      expect(Number(de(a.grupoId, "gemini-3.5-flash")?.tokens_entrada)).toBe(5);
      expect(Number(de(b.grupoId, "gpt-4.1-mini")?.tokens_entrada)).toBe(7);
      expect(linhas).toHaveLength(3);
    });
  });

  it("saúde: tentativas, respostas, erros e fallbacks da janela; última resposta de sempre", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "saude-a" });
      const b = await criarGrupo(tx, { slug: "saude-b" });
      const agora = Date.now();
      const horas = (h: number) => new Date(agora - h * 3_600_000).toISOString();
      await interacao(tx, a, { acao: "respondida", criadaEm: horas(2) });
      await interacao(tx, a, { acao: "erro_envio", fallback: true, criadaEm: horas(3) });
      await interacao(tx, a, { acao: "silenciada_por_modo", criadaEm: horas(4) }); // não é tentativa
      await interacao(tx, a, { acao: "respondida", origem: "playground", criadaEm: horas(5) }); // não é tentativa
      await interacao(tx, b, { acao: "respondida", criadaEm: horas(100) }); // fora da janela

      const [ra] = await tx<{ tentativas: string; respondidas: string; erros_de_envio: string; fallbacks: string; ultima_resposta_em: Date }[]>`
        select * from public.saude_da_ia_por_grupo(${horas(24)}::timestamptz) where grupo_id = ${a.grupoId}
      `;
      expect(Number(ra.tentativas)).toBe(2);
      expect(Number(ra.respondidas)).toBe(2);
      expect(Number(ra.erros_de_envio)).toBe(1);
      expect(Number(ra.fallbacks)).toBe(1);

      const [rb] = await tx<{ tentativas: string; ultima_resposta_em: Date | null }[]>`
        select * from public.saude_da_ia_por_grupo(${horas(24)}::timestamptz) where grupo_id = ${b.grupoId}
      `;
      expect(Number(rb.tentativas)).toBe(0);
      expect(rb.ultima_resposta_em).not.toBeNull();
    });
  });

  it("o logado e o anônimo não executam as funções; a chave de serviço sim", async () => {
    const [r] = await sql<{ auth: boolean; anon: boolean; servico: boolean; auth2: boolean }[]>`
      select has_function_privilege('authenticated', 'public.custo_da_ia_por_grupo(timestamptz)', 'execute') as auth,
             has_function_privilege('anon', 'public.custo_da_ia_por_grupo(timestamptz)', 'execute') as anon,
             has_function_privilege('service_role', 'public.custo_da_ia_por_grupo(timestamptz)', 'execute') as servico,
             has_function_privilege('authenticated', 'public.saude_da_ia_por_grupo(timestamptz)', 'execute') as auth2
    `;
    expect(r).toEqual({ auth: false, anon: false, servico: true, auth2: false });
  });
});
