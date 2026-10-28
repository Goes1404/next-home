// Visitas com histórico (0224), medido no banco local (`npm run db:teste`).
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
} from "@/lib/grupos/apoioDoBanco";
import { daqui, marcar, novoCorretor, novoLead, visitasDo } from "./apoioDaAgendaNoBanco";

describe.skipIf(!process.env.DB_TESTE_URL)("visitas com histórico (0224)", () => {
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

  it("o conflito na troca de dono fica escrito na linha do tempo do lead", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-dono-nota" });
      const doGestor = await novoLead(tx, g.gestorId, "Do gestor");
      const doCorretor = await novoLead(tx, g.corretorId, "Do corretor");
      await marcar(tx, doGestor, await daqui(tx, 24));
      await marcar(tx, doCorretor, await daqui(tx, 24));
      await tx`update public.leads set corretor_id = ${g.gestorId} where id = ${doCorretor}`;
      const notas = await tx<{ tipo: string }[]>`
        select tipo from public.lead_interacoes where lead_id = ${doCorretor} and detalhes ? 'visita_ficou_com'
      `;
      expect(notas.map((n) => n.tipo)).toEqual(["sistema"]);
    }));

  it("remarcar depois de uma troca com conflito leva a visita para o dono atual", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-sobra-remarca" });
      const doGestor = await novoLead(tx, g.gestorId, "Do gestor");
      const doCorretor = await novoLead(tx, g.corretorId, "Do corretor");
      await marcar(tx, doGestor, await daqui(tx, 24));
      await marcar(tx, doCorretor, await daqui(tx, 24));
      await tx`update public.leads set corretor_id = ${g.gestorId} where id = ${doCorretor}`;

      const outraHora = await daqui(tx, 30);
      await marcar(tx, doCorretor, outraHora);
      const [v, ...resto] = await visitasDo(tx, doCorretor);
      expect(resto).toHaveLength(0);
      expect(v.corretor_id).toBe(g.gestorId);
      expect(v.inicio.getTime()).toBe(outraHora.getTime());
    }));

  it("a troca seguinte pega a visita que tinha ficado com o dono anterior", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-sobra-troca" });
      const terceiro = await novoCorretor(tx, g.grupoId, "vis-sobra-troca-3");
      const doGestor = await novoLead(tx, g.gestorId, "Do gestor");
      const doCorretor = await novoLead(tx, g.corretorId, "Do corretor");
      await marcar(tx, doGestor, await daqui(tx, 24));
      await marcar(tx, doCorretor, await daqui(tx, 24));
      await tx`update public.leads set corretor_id = ${g.gestorId} where id = ${doCorretor}`;
      await tx`update public.leads set corretor_id = ${terceiro} where id = ${doCorretor}`;
      expect((await visitasDo(tx, doCorretor))[0].corretor_id).toBe(terceiro);
    }));

  it("lead sem dono que ganha dono passa a ter a visita na agenda dele", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-sem-dono" });
      // Sem dono é estado de produção (a roleta não achou ninguém); o insert
      // do teste distribui, então o dono sai depois.
      const lead = await novoLead(tx, g.corretorId, "Sem dono");
      await tx`update public.leads set corretor_id = null where id = ${lead}`;
      await marcar(tx, lead, await daqui(tx, 24));
      expect(await visitasDo(tx, lead)).toHaveLength(0);

      await tx`update public.leads set corretor_id = ${g.corretorId} where id = ${lead}`;
      const visitas = await visitasDo(tx, lead);
      expect(visitas.map((v) => [v.status, v.corretor_id])).toEqual([["marcada", g.corretorId]]);
    }));

  it("dono e data trocados no mesmo update: a visita vai para o novo dono na data nova", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-dono-e-data" });
      const lead = await novoLead(tx, g.corretorId);
      const velha = await daqui(tx, 24);
      const nova = await daqui(tx, 48);
      await marcar(tx, lead, velha);
      await tx`update public.leads set corretor_id = ${g.gestorId}, visita_agendada_em = ${nova} where id = ${lead}`;
      const [v, ...resto] = await visitasDo(tx, lead);
      expect(resto).toHaveLength(0);
      expect(v.corretor_id).toBe(g.gestorId);
      expect(v.inicio.getTime()).toBe(nova.getTime());
      expect(v.datas_anteriores.map((d) => d.getTime())).toEqual([velha.getTime()]);
    }));

  it("ajustar a hora logo depois do horário é remarcação, não visita nova em conflito consigo", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-ajuste" });
      const lead = await novoLead(tx, g.corretorId);
      // Relativo ao instante exato (não à hora cheia): começou há 15 min.
      const [{ antes, depois }] = await tx<{ antes: Date; depois: Date }[]>`
        select now() - interval '15 minutes' as antes, now() + interval '15 minutes' as depois
      `;
      await marcar(tx, lead, antes);
      await marcar(tx, lead, depois);
      expect(await visitasDo(tx, lead)).toHaveLength(1);
    }));

  it("lead criado já com visita ganha a linha", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-insert" });
      const quando = await daqui(tx, 24);
      const [{ id: lead }] = await tx<{ id: string }[]>`
        insert into public.leads (nome, telefone, corretor_id, visita_agendada_em)
        values ('Já com visita', '11988887777', ${g.corretorId}, ${quando}) returning id
      `;
      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("a reserva da IA num horário livre devolve true e cria a visita", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-reserva" });
      const lead = await novoLead(tx, g.corretorId);
      const quando = await daqui(tx, 24);
      const [{ reservou }] = await tx<{ reservou: boolean }[]>`
        select public.reservar_horario_visita(${lead}, ${quando}) as reservou
      `;
      expect(reservou).toBe(true);
      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("marcar o retorno logo depois da visita cria visita nova e não apaga a que aconteceu", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-retorno" });
      const lead = await novoLead(tx, g.corretorId);
      const [{ comecou, sabado }] = await tx<{ comecou: Date; sabado: Date }[]>`
        select now() - interval '50 minutes' as comecou, date_trunc('hour', now()) + interval '4 days' as sabado
      `;
      await marcar(tx, lead, comecou);
      await marcar(tx, lead, sabado);
      const visitas = await visitasDo(tx, lead);
      expect(visitas.map((v) => [v.status, v.inicio.getTime()])).toEqual([
        ["marcada", comecou.getTime()],
        ["marcada", sabado.getTime()],
      ]);
    }));

  it("limpar a data de uma visita que já começou não a cancela", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-limpa-em-curso" });
      const lead = await novoLead(tx, g.corretorId);
      const [{ comecou }] = await tx<{ comecou: Date }[]>`select now() - interval '50 minutes' as comecou`;
      await marcar(tx, lead, comecou);
      await marcar(tx, lead, null);
      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("trocar dono e data juntos sem conflito na data nova não deixa nota de conflito", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-dono-data-nota" });
      const doGestor = await novoLead(tx, g.gestorId, "Do gestor");
      const doCorretor = await novoLead(tx, g.corretorId, "Do corretor");
      await marcar(tx, doGestor, await daqui(tx, 24));
      await marcar(tx, doCorretor, await daqui(tx, 24));
      const livre = await daqui(tx, 30);
      await tx`update public.leads set corretor_id = ${g.gestorId}, visita_agendada_em = ${livre} where id = ${doCorretor}`;

      const [v] = await visitasDo(tx, doCorretor);
      expect([v.corretor_id, v.inicio.getTime()]).toEqual([g.gestorId, livre.getTime()]);
      const notas = await tx`
        select 1 from public.lead_interacoes where lead_id = ${doCorretor} and detalhes ? 'visita_ficou_com'
      `;
      expect(notas).toHaveLength(0);
    }));

  it("arquivar o lead cancela a visita futura e libera o horário", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-arquivar" });
      const lead = await novoLead(tx, g.corretorId);
      const outro = await novoLead(tx, g.corretorId, "Outro");
      const amanha = await daqui(tx, 24);
      await marcar(tx, lead, amanha);
      await tx`update public.leads set arquivado_em = now() where id = ${lead}`;
      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["cancelada"]);
      await marcar(tx, outro, await daqui(tx, 24.5));
      expect((await visitasDo(tx, outro)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("desarquivar o lead com data futura devolve a visita à agenda", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-desarquivar" });
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      await tx`update public.leads set arquivado_em = now() where id = ${lead}`;
      await tx`update public.leads set arquivado_em = null where id = ${lead}`;
      expect((await visitasDo(tx, lead)).map((v) => v.status).sort()).toEqual(["cancelada", "marcada"]);
    }));

  it("o grupo da visita é o do lead", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "vis-grupo" });
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      expect((await visitasDo(tx, lead))[0].grupo_id).toBe(g.grupoId);
    }));
});
