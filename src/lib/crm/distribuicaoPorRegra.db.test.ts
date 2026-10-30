// Distribuição por regra (0246), medida no banco local (`npm run db:teste`).
//
// O gatilho `distribuir_lead` olha as regras do gestor ANTES da roleta, em
// ordem; sem regra que case, a roleta de sempre. A simulação responde só ao
// gestor, no grupo dele. Pula sem DB_TESTE_URL. Cada teste roda numa
// transação desfeita.

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

async function leadDaRoleta(
  sql: Conexao,
  grupoId: string,
  extra: { regiao?: string; orcamento?: number; origem?: string } = {},
): Promise<{ corretor_id: string | null; origem_atribuicao: string | null; detalhes: Record<string, unknown> | null }> {
  const [linha] = await sql<{ corretor_id: string | null; origem_atribuicao: string | null; detalhes: Record<string, unknown> | null }[]>`
    insert into public.leads (nome, telefone, grupo_id, regiao_interesse, orcamento_max, origem)
    values ('Cliente', '11988887777', ${grupoId}, ${extra.regiao ?? null}, ${extra.orcamento ?? null}, ${extra.origem ?? null})
    returning corretor_id, origem_atribuicao, detalhes
  `;
  return linha;
}

/** Carga para a roleta: um lead em andamento do corretor, chegado agora. */
async function carga(sql: Conexao, corretorId: string, quantos = 1) {
  for (let i = 0; i < quantos; i++) {
    await sql`insert into public.leads (nome, telefone, corretor_id) values ('Carga', '11977776666', ${corretorId})`;
  }
}

describe.skipIf(!process.env.DB_TESTE_URL)("distribuição por regra (0246)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("sem regra, a roleta de sempre: o menos carregado, sem marca de regra", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "regra-sem" });
      await carga(tx, g.gestorId, 2);
      const lead = await leadDaRoleta(tx, g.grupoId, { regiao: "Alphaville" });
      expect(lead.corretor_id).toBe(g.corretorId);
      expect(lead.origem_atribuicao).toBe("roleta");
      expect(lead.detalhes?.regraDeDistribuicao).toBeUndefined();
    }));

  it("a primeira regra que casa decide, mesmo contra a carga; a que não casa não conta", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "regra-ordem" });
      await carga(tx, g.gestorId, 3);
      await tx`
        insert into public.regras_distribuicao (grupo_id, ordem, nome, criterio, regioes, corretores)
        values (${g.grupoId}, 1, 'Alphaville para o gestor', 'regiao', array['Alphaville'], array[${g.gestorId}]::uuid[])
      `;
      await tx`
        insert into public.regras_distribuicao (grupo_id, ordem, nome, criterio, valor_min, corretores)
        values (${g.grupoId}, 2, 'Alto padrão para o corretor', 'faixa_valor', 1000000, array[${g.corretorId}]::uuid[])
      `;
      const daRegiao = await leadDaRoleta(tx, g.grupoId, { regiao: "perto de ALPHAVILLE", orcamento: 2_000_000 });
      expect(daRegiao.corretor_id).toBe(g.gestorId);
      expect(daRegiao.detalhes?.regraDeDistribuicao).toBe("Alphaville para o gestor");

      const doValor = await leadDaRoleta(tx, g.grupoId, { regiao: "Centro", orcamento: 2_000_000 });
      expect(doValor.corretor_id).toBe(g.corretorId);
      expect(doValor.detalhes?.regraDeDistribuicao).toBe("Alto padrão para o corretor");
    }));

  it("regra que casa sem ninguém disponível passa a vez; desligada não conta", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "regra-pausa" });
      await carga(tx, g.corretorId, 3);
      await tx`
        insert into public.regras_distribuicao (grupo_id, ordem, nome, criterio, origens, corretores)
        values (${g.grupoId}, 1, 'Site para o corretor', 'origem', array['site'], array[${g.corretorId}]::uuid[])
      `;
      await tx`update public.corretores set em_pausa = true where id = ${g.corretorId}`;
      const emPausa = await leadDaRoleta(tx, g.grupoId, { origem: "site/contato" });
      expect(emPausa.corretor_id).toBe(g.gestorId);
      expect(emPausa.detalhes?.regraDeDistribuicao).toBeUndefined();

      await tx`update public.corretores set em_pausa = false where id = ${g.corretorId}`;
      await tx`update public.regras_distribuicao set ativa = false where grupo_id = ${g.grupoId}`;
      const desligada = await leadDaRoleta(tx, g.grupoId, { origem: "site/contato" });
      expect(desligada.detalhes?.regraDeDistribuicao).toBeUndefined();
    }));

  it("corretor de outro grupo na lista da regra nunca recebe", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "regra-a" });
      const b = await criarGrupo(tx, { slug: "regra-b" });
      await tx`
        insert into public.regras_distribuicao (grupo_id, ordem, nome, criterio, origens, corretores)
        values (${a.grupoId}, 1, 'Portal para fora', 'origem', array['portal'], array[${b.corretorId}]::uuid[])
      `;
      const lead = await leadDaRoleta(tx, a.grupoId, { origem: "inbound/zap" });
      expect([a.gestorId, a.corretorId]).toContain(lead.corretor_id);
      expect(lead.detalhes?.regraDeDistribuicao).toBeUndefined();
    }));

  it("simular responde ao gestor, no grupo dele, sem gravar; ao corretor, recusa", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "regra-simula" });
      await tx`
        insert into public.regras_distribuicao (grupo_id, ordem, nome, criterio, regioes, corretores)
        values (${g.grupoId}, 1, 'Tamboré', 'regiao', array['Tamboré'], array[${g.corretorId}]::uuid[])
      `;
      const antes = await tx<{ n: number }[]>`select count(*)::int as n from public.leads where grupo_id = ${g.grupoId}`;
      const resposta = await comoUsuario(tx, g.gestorUserId, (eu) =>
        eu<{ corretor_id: string; regra_nome: string | null }[]>`
          select corretor_id, regra_nome from public.simular_distribuicao(null, 'Tamboré', null, null, null, 'site')
        `,
      );
      expect(resposta).toEqual([{ corretor_id: g.corretorId, regra_nome: "Tamboré" }]);
      const depois = await tx<{ n: number }[]>`select count(*)::int as n from public.leads where grupo_id = ${g.grupoId}`;
      expect(depois[0].n).toBe(antes[0].n);

      await expect(
        comoUsuario(tx, g.corretorUserId, (eu) => eu`select * from public.simular_distribuicao(null, null, null, null, null, 'site')`),
      ).rejects.toThrow(/sem_permissao/);
    }));
});
