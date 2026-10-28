// "A visita aconteceu?" (0227), medido no banco local (`npm run db:teste`).
//
// A resposta move o funil só de quem está em Visita marcada e grava o
// histórico de etapa; "remarcou" é a mesma visita com a data nova; 24h sem
// resposta depois da cobrança vira sem_confirmacao. Pula sem DB_TESTE_URL.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
} from "@/lib/grupos/apoioDoBanco";
import { daqui, novoCorretor, novoLead, visitasDo } from "./apoioDaAgendaNoBanco";

/**
 * Visita que já passou: escrita no lead, como todo escritor faz (o espelho
 * cria a linha), com a cobrança opcional `cobradaHa` horas atrás.
 */
async function visitaPassada(sql: Conexao, leadId: string, corretorId: string, horasAtras: number, cobradaHa?: number) {
  const inicio = await daqui(sql, -horasAtras);
  await sql`update public.leads set corretor_id = ${corretorId}, etapa = 'visita_agendada', visita_agendada_em = ${inicio} where id = ${leadId}`;
  const [{ id }] = await sql<{ id: string }[]>`select id from public.visitas where lead_id = ${leadId} and inicio = ${inicio}`;
  if (cobradaHa !== undefined) {
    await sql`update public.visitas set cobrada_em = ${await daqui(sql, -cobradaHa)} where id = ${id}`;
  }
  return id;
}

async function responder(sql: Conexao, visita: string, corretor: string, resposta: string, nova: Date | null = null) {
  const [{ r }] = await sql<{ r: string }[]>`select public.responder_visita(${visita}, ${corretor}, ${resposta}, ${nova}) as r`;
  return r;
}

async function etapa(sql: Conexao, lead: string) {
  const [{ etapa: e }] = await sql<{ etapa: string }[]>`select etapa from public.leads where id = ${lead}`;
  return e;
}

describe.skipIf(!process.env.DB_TESTE_URL)("a visita aconteceu? (0227)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("aconteceu: realizada, lead em Visitou e histórico de etapa gravado", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-sim" });
      const lead = await novoLead(tx, g.corretorId);
      const v = await visitaPassada(tx, lead, g.corretorId, 3);
      expect(await responder(tx, v, g.corretorId, "aconteceu")).toBe("ok");
      expect((await visitasDo(tx, lead)).map((x) => x.status)).toEqual(["realizada"]);
      expect(await etapa(tx, lead)).toBe("visitou");
      const [h] = await tx<{ detalhes: { de: string; para: string } }[]>`
        select detalhes from public.lead_interacoes where lead_id = ${lead} and tipo = 'etapa'`;
      expect(h.detalhes).toMatchObject({ de: "visita_agendada", para: "visitou" });
    }));

  it("faltou: lead volta a Em conversa", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-faltou" });
      const lead = await novoLead(tx, g.corretorId);
      const v = await visitaPassada(tx, lead, g.corretorId, 3);
      expect(await responder(tx, v, g.corretorId, "faltou")).toBe("ok");
      expect(await etapa(tx, lead)).toBe("em_conversa");
    }));

  it("quem já avançou no funil não recua", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-avancou" });
      const lead = await novoLead(tx, g.corretorId);
      const v = await visitaPassada(tx, lead, g.corretorId, 3);
      await tx`update public.leads set etapa = 'proposta' where id = ${lead}`;
      expect(await responder(tx, v, g.corretorId, "faltou")).toBe("ok");
      expect(await etapa(tx, lead)).toBe("proposta");
    }));

  it("remarcou: a mesma visita com a data nova, e o lead espelha sem criar outra", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-remarcou" });
      const lead = await novoLead(tx, g.corretorId);
      const v = await visitaPassada(tx, lead, g.corretorId, 3);
      const nova = await daqui(tx, 48);
      expect(await responder(tx, v, g.corretorId, "remarcou", nova)).toBe("ok");
      const visitas = await visitasDo(tx, lead);
      expect(visitas).toHaveLength(1);
      expect(visitas[0]).toMatchObject({ status: "marcada", inicio: nova });
      expect(visitas[0].datas_anteriores).toHaveLength(1);
      const [l] = await tx<{ visita_agendada_em: Date }[]>`select visita_agendada_em from public.leads where id = ${lead}`;
      expect(l.visita_agendada_em).toEqual(nova);
      expect(await etapa(tx, lead)).toBe("visita_agendada");
    }));

  it("remarcou para horário ocupado devolve conflito e não mexe", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-conflito" });
      const lead = await novoLead(tx, g.corretorId);
      const outro = await novoLead(tx, g.corretorId, "Outro");
      const nova = await daqui(tx, 48);
      await tx`update public.leads set visita_agendada_em = ${nova} where id = ${outro}`;
      const v = await visitaPassada(tx, lead, g.corretorId, 3);
      expect(await responder(tx, v, g.corretorId, "remarcou", nova)).toBe("conflito");
      expect((await visitasDo(tx, lead))[0].status).toBe("marcada");
    }));

  it("só quem fez a visita responde, e só depois do horário", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-quem" });
      const b = await novoCorretor(tx, g.grupoId, "ac-quem-b");
      const lead = await novoLead(tx, g.corretorId);
      const v = await visitaPassada(tx, lead, g.corretorId, 3);
      expect(await responder(tx, v, b, "aconteceu")).toBe("nao_encontrada");
      const futura = await novoLead(tx, g.corretorId, "Futura");
      await tx`update public.leads set visita_agendada_em = ${await daqui(tx, 30)} where id = ${futura}`;
      const [{ id }] = await tx<{ id: string }[]>`select id from public.visitas where lead_id = ${futura}`;
      expect(await responder(tx, id, g.corretorId, "aconteceu")).toBe("nao_encontrada");
    }));

  it("24h sem resposta depois da cobrança vira sem confirmação; antes disso, não", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "ac-24h" });
      const velha = await novoLead(tx, g.corretorId, "Velha");
      const recente = await novoLead(tx, g.corretorId, "Recente");
      await visitaPassada(tx, velha, g.corretorId, 30, 27);
      await visitaPassada(tx, recente, g.corretorId, 28, 5);
      await tx`select public.marcar_visitas_sem_confirmacao()`;
      expect((await visitasDo(tx, velha))[0].status).toBe("sem_confirmacao");
      expect((await visitasDo(tx, recente))[0].status).toBe("marcada");
    }));
});
