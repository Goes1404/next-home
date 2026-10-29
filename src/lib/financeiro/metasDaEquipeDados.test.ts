import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, leiturasSemGrupo, type BancoFalso } from "../../../test/bancoFalso";

/**
 * O que o placar do mês lê (0246): visitas para quem FAZ, propostas para o
 * dono do lead (uma por lead), vendas do ranking — e nada de outro grupo.
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

const { lerFeitosDoMes, lerMetasDoMes, limitesDoMes } = await import("./metasDaEquipeDados");

const agora = new Date("2026-10-20T15:00:00Z");

beforeEach(() => {
  banco = bancoFalso({
    metas_da_equipe: [
      { corretor_id: "ana", mes: "2026-10-01", meta_visitas: 10, meta_propostas: null, meta_vendas: 2, grupo_id: GRUPO_A },
      { corretor_id: "bia", mes: "2026-10-01", meta_visitas: 99, meta_propostas: 99, meta_vendas: 99, grupo_id: GRUPO_B },
    ],
    visitas: [
      { corretor_id: "ana", inicio: "2026-10-10T13:00:00.000Z", status: "realizada", grupo_id: GRUPO_A },
      { corretor_id: "ana", inicio: "2026-10-19T13:00:00.000Z", status: "marcada", grupo_id: GRUPO_A },
      // Futura: ainda não conta.
      { corretor_id: "ana", inicio: "2026-10-25T13:00:00.000Z", status: "marcada", grupo_id: GRUPO_A },
      { corretor_id: "caio", inicio: "2026-10-12T13:00:00.000Z", status: "realizada", grupo_id: GRUPO_A },
      { corretor_id: "bia", inicio: "2026-10-12T13:00:00.000Z", status: "realizada", grupo_id: GRUPO_B },
    ],
    lead_interacoes: [
      { lead_id: "l1", tipo: "etapa", detalhes: { de: "visitou", para: "proposta" }, created_at: "2026-10-05T12:00:00.000Z", grupo_id: GRUPO_A },
      // O mesmo lead voltou e foi de novo: conta uma vez.
      { lead_id: "l1", tipo: "etapa", detalhes: { de: "visitou", para: "proposta" }, created_at: "2026-10-15T12:00:00.000Z", grupo_id: GRUPO_A },
      { lead_id: "l2", tipo: "etapa", detalhes: { de: "proposta", para: "documentacao" }, created_at: "2026-10-15T12:00:00.000Z", grupo_id: GRUPO_A },
      { lead_id: "lb", tipo: "etapa", detalhes: { para: "proposta" }, created_at: "2026-10-15T12:00:00.000Z", grupo_id: GRUPO_B },
    ],
    leads: [
      { id: "l1", corretor_id: "caio", grupo_id: GRUPO_A },
      { id: "l2", corretor_id: "ana", grupo_id: GRUPO_A },
      { id: "lb", corretor_id: "bia", grupo_id: GRUPO_B },
    ],
  });
});

describe("o placar lê do banco", () => {
  it("as metas do mês, só do grupo", async () => {
    const metas = await lerMetasDoMes(GRUPO_A, "2026-10-01");
    expect([...metas!.entries()]).toEqual([["ana", { visitas: 10, propostas: null, vendas: 2 }]]);
  });

  it("visitas para quem faz, propostas para o dono do lead, vendas do ranking", async () => {
    const feitos = await lerFeitosDoMes(GRUPO_A, "2026-10-01", new Map([["ana", 1], ["zero", 0]]), agora);
    expect(feitos.get("ana")).toEqual({ visitas: 2, propostas: 0, vendas: 1 });
    expect(feitos.get("caio")).toEqual({ visitas: 1, propostas: 1, vendas: 0 });
    expect(feitos.has("bia")).toBe(false);
    expect(feitos.has("zero")).toBe(false);
  });

  it("toda leitura filtra o grupo", async () => {
    await lerMetasDoMes(GRUPO_A, "2026-10-01");
    await lerFeitosDoMes(GRUPO_A, "2026-10-01", new Map(), agora);
    for (const tabela of ["metas_da_equipe", "visitas", "lead_interacoes", "leads"]) {
      expect(leiturasSemGrupo(banco, tabela), tabela).toEqual([]);
    }
  });

  it("os limites do mês em São Paulo, inclusive na virada do ano", () => {
    expect(limitesDoMes("2026-10-01")).toEqual({ desde: "2026-10-01T00:00:00-03:00", ate: "2026-11-01T00:00:00-03:00" });
    expect(limitesDoMes("2026-12-01").ate).toBe("2027-01-01T00:00:00-03:00");
  });
});
