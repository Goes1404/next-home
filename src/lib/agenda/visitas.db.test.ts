// Visitas com histórico (0222), medido no banco local (`npm run db:teste`).
//
// `leads.visita_agendada_em` continua sendo a porta de escrita; o gatilho
// `leads_zz_espelha_visita` espelha cada mudança em `visitas`. Estes testes
// escrevem na coluna do lead, como a IA, o chat e o painel escrevem, e leem
// o efeito na tabela nova.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

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

type Visita = {
  id: string;
  grupo_id: string;
  corretor_id: string;
  status: string;
  inicio: Date;
  fim: Date;
  datas_anteriores: Date[];
};

async function novoLead(sql: Conexao, corretorId: string, nome = "Cliente"): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.leads (nome, telefone, corretor_id)
    values (${nome}, '11988887777', ${corretorId}) returning id
  `;
  return id;
}

/** `horas` a partir da hora cheia de agora (o `now()` da transação). */
async function daqui(sql: Conexao, horas: number): Promise<Date> {
  const [{ t }] = await sql<{ t: Date }[]>`
    select date_trunc('hour', now()) + make_interval(mins => ${Math.round(horas * 60)}) as t
  `;
  return t;
}

async function marcar(sql: Conexao, leadId: string, quando: Date | null): Promise<void> {
  await sql`update public.leads set visita_agendada_em = ${quando} where id = ${leadId}`;
}

async function visitasDo(sql: Conexao, leadId: string): Promise<Visita[]> {
  return sql<Visita[]>`
    select id, grupo_id, corretor_id, status, inicio, fim, datas_anteriores
      from public.visitas where lead_id = ${leadId} order by inicio, created_at
  `;
}

describe.skipIf(!process.env.DB_TESTE_URL)("visitas com histórico (0222)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("marcar visita cria uma linha marcada de 60 min", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-marcar" });
      const lead = await novoLead(tx, g.corretorId);
      const amanha = await daqui(tx, 24);
      await marcar(tx, lead, amanha);

      const [v, ...resto] = await visitasDo(tx, lead);
      expect(resto).toHaveLength(0);
      expect(v.status).toBe("marcada");
      expect(v.corretor_id).toBe(g.corretorId);
      expect(v.inicio.getTime()).toBe(amanha.getTime());
      expect(v.fim.getTime() - v.inicio.getTime()).toBe(60 * 60_000);
    }));

  it("remarcar visita futura reescreve a mesma linha e guarda a data velha", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-remarcar" });
      const lead = await novoLead(tx, g.corretorId);
      const velha = await daqui(tx, 24);
      const nova = await daqui(tx, 48);
      await marcar(tx, lead, velha);
      await marcar(tx, lead, nova);

      const visitas = await visitasDo(tx, lead);
      expect(visitas).toHaveLength(1);
      expect(visitas[0].status).toBe("marcada");
      expect(visitas[0].inicio.getTime()).toBe(nova.getTime());
      expect(visitas[0].datas_anteriores.map((d) => d.getTime())).toEqual([velha.getTime()]);
    }));

  it("data nova em lead com visita passada cria outra visita", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-passada" });
      const lead = await novoLead(tx, g.corretorId);
      const ontem = await daqui(tx, -24);
      const amanha = await daqui(tx, 24);
      await marcar(tx, lead, ontem);
      await marcar(tx, lead, amanha);

      const visitas = await visitasDo(tx, lead);
      expect(visitas).toHaveLength(2);
      expect(visitas[0].inicio.getTime()).toBe(ontem.getTime());
      expect(visitas[0].datas_anteriores).toEqual([]);
      expect(visitas[1].inicio.getTime()).toBe(amanha.getTime());
    }));

  it("desmarcar vira cancelada e libera o horário", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-cancelar" });
      const lead = await novoLead(tx, g.corretorId);
      const outro = await novoLead(tx, g.corretorId, "Outro");
      const amanha = await daqui(tx, 24);
      await marcar(tx, lead, amanha);
      await marcar(tx, lead, null);

      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["cancelada"]);
      await marcar(tx, outro, amanha);
      expect((await visitasDo(tx, outro)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("segunda visita 30 min depois é recusada", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-conflito" });
      const primeiro = await novoLead(tx, g.corretorId);
      const segundo = await novoLead(tx, g.corretorId, "Segundo");
      const amanha = await daqui(tx, 24);
      const meiaHoraDepois = await daqui(tx, 24.5);
      await marcar(tx, primeiro, amanha);

      await tx`savepoint antes_do_conflito`;
      await expect(marcar(tx, segundo, meiaHoraDepois)).rejects.toMatchObject({ code: "23P01" });
      await tx`rollback to savepoint antes_do_conflito`;

      const [{ reservou }] = await tx<{ reservou: boolean }[]>`
        select public.reservar_horario_visita(${segundo}, ${meiaHoraDepois}) as reservou
      `;
      expect(reservou).toBe(false);
      expect(await visitasDo(tx, segundo)).toHaveLength(0);
    }));

  it("visita 60 min depois passa", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-encostada" });
      const primeiro = await novoLead(tx, g.corretorId);
      const segundo = await novoLead(tx, g.corretorId, "Segundo");
      await marcar(tx, primeiro, await daqui(tx, 24));
      await marcar(tx, segundo, await daqui(tx, 25));
      expect((await visitasDo(tx, segundo)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  // Mesmo instante (o índice da 0074 recusava) e meia hora depois (a
  // exclusão de 60 min recusa): nos dois a troca de dono tem de passar.
  for (const [nome, defasagem] of [
    ["no mesmo instante", 0],
    ["meia hora depois", 0.5],
  ] as const) {
    it(`trocar o dono do lead com conflito ${nome} não derruba o update`, () =>
      emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: `vis-dono-conflito-${defasagem * 10}` });
        const doGestor = await novoLead(tx, g.gestorId, "Do gestor");
        const doCorretor = await novoLead(tx, g.corretorId, "Do corretor");
        await marcar(tx, doGestor, await daqui(tx, 24));
        await marcar(tx, doCorretor, await daqui(tx, 24 + defasagem));

        await tx`update public.leads set corretor_id = ${g.gestorId} where id = ${doCorretor}`;

        const [{ corretor_id }] = await tx<{ corretor_id: string }[]>`
          select corretor_id from public.leads where id = ${doCorretor}
        `;
        expect(corretor_id).toBe(g.gestorId);
        expect((await visitasDo(tx, doCorretor))[0].corretor_id).toBe(g.corretorId);
      }));
  }

  it("trocar o dono sem conflito leva a visita futura junto", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-dono" });
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      await tx`update public.leads set corretor_id = ${g.gestorId} where id = ${lead}`;
      expect((await visitasDo(tx, lead))[0].corretor_id).toBe(g.gestorId);
    }));

  it("o grupo da visita é o do lead", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-grupo" });
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      expect((await visitasDo(tx, lead))[0].grupo_id).toBe(g.grupoId);
    }));
});
