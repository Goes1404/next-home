// Reuniões e bloqueios (0224), medidos no banco local (`npm run db:teste`).
//
// A IA não pode oferecer horário ocupado por compromisso que só a tela
// conhece: a visita que cruza reunião ou bloqueio é recusada com o mesmo
// código da trava de visitas (23P01), e a reserva da IA devolve false.
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita.

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
import { daqui, marcar, novoLead, visitasDo } from "./apoioDaAgendaNoBanco";

async function compromisso(
  sql: Conexao,
  p: { tipo: "reuniao" | "bloqueio"; criadoPor: string; inicio: Date; fim: Date; participantes: string[] },
): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.compromissos (tipo, titulo, inicio, fim, criado_por)
    values (${p.tipo}, 'Teste', ${p.inicio}, ${p.fim}, ${p.criadoPor}) returning id
  `;
  for (const corretor of p.participantes) {
    await sql`
      insert into public.compromisso_participantes (compromisso_id, corretor_id, inicio, fim)
      values (${id}, ${corretor}, ${p.inicio}, ${p.fim})
    `;
  }
  return id;
}

async function codigoDoErro(f: () => Promise<unknown>): Promise<string | null> {
  try {
    await f();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "sem código";
  }
}

describe.skipIf(!process.env.DB_TESTE_URL)("reuniões e bloqueios (0224)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("visita que cruza bloqueio do corretor é recusada com 23P01", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-bloq" });
      await compromisso(tx, {
        tipo: "bloqueio",
        criadoPor: g.corretorId,
        inicio: await daqui(tx, 24),
        fim: await daqui(tx, 26),
        participantes: [g.corretorId],
      });
      const lead = await novoLead(tx, g.corretorId);
      const quando = await daqui(tx, 25);
      expect(await codigoDoErro(() => tx.savepoint((s) => marcar(s, lead, quando)))).toBe("23P01");
    }));

  it("a reserva da IA num horário de reunião devolve false", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-reuniao" });
      const inicio = await daqui(tx, 48);
      await compromisso(tx, {
        tipo: "reuniao",
        criadoPor: g.gestorId,
        inicio,
        fim: await daqui(tx, 49),
        participantes: [g.corretorId, g.gestorId],
      });
      const lead = await novoLead(tx, g.corretorId);
      const [{ ok }] = await tx<{ ok: boolean }[]>`select public.reservar_horario_visita(${lead}, ${await daqui(tx, 48.5)}) as ok`;
      expect(ok).toBe(false);
      // Encostada no fim da reunião, passa.
      const [{ ok: depois }] = await tx<{ ok: boolean }[]>`select public.reservar_horario_visita(${lead}, ${await daqui(tx, 49)}) as ok`;
      expect(depois).toBe(true);
    }));

  it("bloqueio sobre visita marcada do próprio corretor é recusado", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-sobre-visita" });
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      const inicio = await daqui(tx, 23.5);
      const fim = await daqui(tx, 24.5);
      expect(
        await codigoDoErro(() =>
          tx.savepoint((s) =>
            compromisso(s, { tipo: "bloqueio", criadoPor: g.corretorId, inicio, fim, participantes: [g.corretorId] }),
          ),
        ),
      ).toBe("23P01");
    }));

  it("reunião sobre visita marcada é aceita (o gestor manda; a tela avisa)", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-reuniao-visita" });
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 24));
      const inicio = await daqui(tx, 24);
      const fim = await daqui(tx, 25);
      await compromisso(tx, { tipo: "reuniao", criadoPor: g.gestorId, inicio, fim, participantes: [g.corretorId] });
      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("cancelar o compromisso libera o horário", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-cancelar" });
      const id = await compromisso(tx, {
        tipo: "bloqueio",
        criadoPor: g.corretorId,
        inicio: await daqui(tx, 24),
        fim: await daqui(tx, 26),
        participantes: [g.corretorId],
      });
      await tx`update public.compromissos set cancelado_em = now() where id = ${id}`;
      const lead = await novoLead(tx, g.corretorId);
      await marcar(tx, lead, await daqui(tx, 25));
      expect((await visitasDo(tx, lead)).map((v) => v.status)).toEqual(["marcada"]);
    }));

  it("o grupo do compromisso e do participante é o de quem criou", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-grupo" });
      const id = await compromisso(tx, {
        tipo: "reuniao",
        criadoPor: g.gestorId,
        inicio: await daqui(tx, 24),
        fim: await daqui(tx, 25),
        participantes: [g.corretorId],
      });
      const [c] = await tx<{ grupo_id: string }[]>`select grupo_id from public.compromissos where id = ${id}`;
      const [p] = await tx<{ grupo_id: string }[]>`select grupo_id from public.compromisso_participantes where compromisso_id = ${id}`;
      expect([c.grupo_id, p.grupo_id]).toEqual([g.grupoId, g.grupoId]);
    }));

  it("participante de outro grupo é recusado", () =>
    emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "cp-isola-a" });
      const h = await criarGrupo(tx, { slug: "cp-isola-b" });
      const inicio = await daqui(tx, 24);
      const fim = await daqui(tx, 25);
      expect(
        await codigoDoErro(() =>
          tx.savepoint((s) => compromisso(s, { tipo: "reuniao", criadoPor: g.gestorId, inicio, fim, participantes: [h.corretorId] })),
        ),
      ).not.toBeNull();
    }));
});

