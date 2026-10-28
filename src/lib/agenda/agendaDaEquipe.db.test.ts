// Agenda da equipe (0225), medida no banco local (`npm run db:teste`).
//
// A visita passada pelo gestor a outro corretor (B) continua com B quando o
// lead muda de dono ou a visita é remarcada, e a reserva da IA usa a grade de
// B. `numeros_da_agenda` conta no mês de São Paulo e o negócio uma vez por
// lead. Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita.

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
import { daqui, marcar, novoCorretor, novoLead, visitasDo } from "./apoioDaAgendaNoBanco";

type Numeros = {
  mes: string;
  marcadas: number;
  realizadas: number;
  faltas: number;
  sem_confirmacao: number;
  negocios: number;
};

async function passar(sql: Conexao, leadId: string, para: string): Promise<void> {
  await sql`update public.visitas set corretor_id = ${para}, passada_em = now() where lead_id = ${leadId} and status = 'marcada'`;
}

/**
 * Visita direto na tabela (passado, com status), como a cobrança da fase 4 deixa.
 * O `::text` antes do `::timestamp` é de propósito: com o tipo do parâmetro
 * inferido como timestamp, o postgres.js passa a string por `new Date` no fuso
 * da máquina e a hora chega deslocada.
 */
async function visitaEm(sql: Conexao, leadId: string, corretorId: string, quandoSp: string, status: string) {
  await sql`
    insert into public.visitas (grupo_id, lead_id, corretor_id, inicio, fim, status)
    select l.grupo_id, l.id, ${corretorId}, (${quandoSp}::text::timestamp at time zone 'America/Sao_Paulo'),
           (${quandoSp}::text::timestamp at time zone 'America/Sao_Paulo') + interval '60 minutes', ${status}
      from public.leads l where l.id = ${leadId}
  `;
}

async function etapaEm(sql: Conexao, leadId: string, para: string, quandoSp: string) {
  await sql`
    insert into public.lead_interacoes (lead_id, tipo, conteudo, detalhes, created_at)
    values (${leadId}, 'etapa', 'mudança', ${sql.json({ de: "visitou", para })},
            (${quandoSp}::text::timestamp at time zone 'America/Sao_Paulo'))
  `;
}

async function numeros(sql: Conexao, grupoId: string, corretorId: string | null, de: string, ate: string) {
  const linhas = await sql<Numeros[]>`
    select to_char(mes, 'YYYY-MM') as mes, marcadas, realizadas, faltas, sem_confirmacao, negocios
      from public.numeros_da_agenda(${grupoId}, ${corretorId}, ${de}::date, ${ate}::date)
     order by mes
  `;
  return linhas.map((l) => ({ ...l }));
}

describe.skipIf(!process.env.DB_TESTE_URL)("agenda da equipe (0225)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("visita passada fica com quem recebeu quando o dono do lead muda", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-dono" });
      const b = await novoCorretor(tx, g.grupoId, "eq-dono-b");
      const c = await novoCorretor(tx, g.grupoId, "eq-dono-c");
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      await passar(tx, lead, b);
      await tx`update public.leads set corretor_id = ${c} where id = ${lead}`;
      expect((await visitasDo(tx, lead)).map((v) => v.corretor_id)).toEqual([b]);
    }));

  it("remarcar visita passada mantém quem recebeu", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-remarcar" });
      const b = await novoCorretor(tx, g.grupoId, "eq-remarcar-b");
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      await passar(tx, lead, b);
      await marcar(tx, lead, await daqui(tx, 26));
      const visitas = await visitasDo(tx, lead);
      expect(visitas.map((v) => [v.corretor_id, v.status])).toEqual([[b, "marcada"]]);
    }));

  it("a reserva da IA usa a grade de quem faz a visita passada", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-grade" });
      const b = await novoCorretor(tx, g.grupoId, "eq-grade-b");
      // B só atende domingo; o dono (sem grade) atende todo dia.
      await tx`insert into public.corretor_disponibilidade (corretor_id, dia_semana, hora_inicio, hora_fim)
               values (${b}, 0, 9, 20)`;
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      await passar(tx, lead, b);
      const [{ sabado, domingo }] = await tx<{ sabado: Date; domingo: Date }[]>`
        select (date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '12 days 10 hours') at time zone 'America/Sao_Paulo' as sabado,
               (date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '13 days 10 hours') at time zone 'America/Sao_Paulo' as domingo
      `;
      const [{ ok: noSabado }] = await tx<{ ok: boolean }[]>`select public.reservar_horario_visita(${lead}, ${sabado}) as ok`;
      expect(noSabado).toBe(false);
      const [{ ok: noDomingo }] = await tx<{ ok: boolean }[]>`select public.reservar_horario_visita(${lead}, ${domingo}) as ok`;
      expect(noDomingo).toBe(true);
      expect((await visitasDo(tx, lead)).map((v) => v.corretor_id)).toEqual([b]);
    }));

  it("numeros_da_agenda conta no mês de São Paulo", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-fuso" });
      const lead = await novoLead(tx, g.corretorId);
      await visitaEm(tx, lead, g.corretorId, "2026-01-31 22:00", "realizada");
      expect(await numeros(tx, g.grupoId, null, "2026-01-01", "2026-02-01")).toEqual([
        { mes: "2026-01", marcadas: 1, realizadas: 1, faltas: 0, sem_confirmacao: 0, negocios: 0 },
      ]);
    }));

  it("cancelada não entra em marcadas; realizada, faltou e sem_confirmacao contam à parte", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-status" });
      const lead = await novoLead(tx, g.corretorId);
      await visitaEm(tx, lead, g.corretorId, "2026-03-02 10:00", "realizada");
      await visitaEm(tx, lead, g.corretorId, "2026-03-03 10:00", "faltou");
      await visitaEm(tx, lead, g.corretorId, "2026-03-04 10:00", "sem_confirmacao");
      await visitaEm(tx, lead, g.corretorId, "2026-03-05 10:00", "cancelada");
      await visitaEm(tx, lead, g.corretorId, "2026-03-06 10:00", "marcada");
      expect(await numeros(tx, g.grupoId, null, "2026-03-01", "2026-03-01")).toEqual([
        { mes: "2026-03", marcadas: 4, realizadas: 1, faltas: 1, sem_confirmacao: 1, negocios: 0 },
      ]);
    }));

  it("negócio conta uma vez por lead, na última visita realizada antes da proposta", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-negocio" });
      const ana = await novoLead(tx, g.corretorId, "Ana");
      await visitaEm(tx, ana, g.corretorId, "2026-01-10 10:00", "realizada");
      await visitaEm(tx, ana, g.corretorId, "2026-02-10 10:00", "realizada");
      await etapaEm(tx, ana, "proposta", "2026-02-20 10:00");
      await etapaEm(tx, ana, "fechado", "2026-03-01 10:00");
      // Bia já estava em proposta antes da visita: conta o fechamento depois dela.
      const bia = await novoLead(tx, g.corretorId, "Bia");
      await etapaEm(tx, bia, "proposta", "2026-01-05 10:00");
      await visitaEm(tx, bia, g.corretorId, "2026-01-15 10:00", "realizada");
      await etapaEm(tx, bia, "fechado", "2026-01-25 10:00");
      const linhas = await numeros(tx, g.grupoId, null, "2026-01-01", "2026-03-01");
      expect(linhas.map((l) => [l.mes, l.negocios])).toEqual([
        ["2026-01", 1],
        ["2026-02", 1],
      ]);
    }));

  it("filtro por corretor conta pelo corretor que fez a visita", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-filtro" });
      const b = await novoCorretor(tx, g.grupoId, "eq-filtro-b");
      const lead = await novoLead(tx, g.corretorId);
      await visitaEm(tx, lead, b, "2026-04-10 10:00", "realizada");
      expect((await numeros(tx, g.grupoId, b, "2026-04-01", "2026-04-01")).map((l) => l.marcadas)).toEqual([1]);
      expect(await numeros(tx, g.grupoId, g.corretorId, "2026-04-01", "2026-04-01")).toEqual([]);
    }));

  it("outro grupo não entra nos números", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "eq-isola-a" });
      const h = await criarGrupo(tx, { slug: "eq-isola-b" });
      const lead = await novoLead(tx, h.corretorId);
      await visitaEm(tx, lead, h.corretorId, "2026-05-10 10:00", "realizada");
      expect(await numeros(tx, g.grupoId, null, "2026-05-01", "2026-05-01")).toEqual([]);
    }));
});
