import { describe, expect, it, vi } from "vitest";
import { bancoFalso } from "../bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => null }));

const { leadsMaisQuentes, TETO_DOS_MAIS_QUENTES } = await import("./consultas");

const G = "g1";
const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "g", papel: "gestor" as const, nome: "Bruna" };

function lead(id: string, dono: string, nota: number | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    nome: `Cliente ${id}`,
    telefone: "5511999990000",
    etapa: "em_conversa",
    grupo_id: G,
    corretor_id: dono,
    nota_score: nota,
    nota_label: nota === null ? null : nota >= 70 ? "quente" : "morno",
    nota_motivo: "Respondeu ontem e pediu visita",
    arquivado_em: null,
    nao_contatar_em: null,
    ...extra,
  };
}

function banco() {
  return bancoFalso({
    leads: [
      lead("a", "c1", 92),
      lead("b", "c2", 88),
      lead("c", "c1", 40),
      lead("d", "c1", null),
      lead("e", "c1", 99, { arquivado_em: "2026-10-01" }),
      lead("f", "c1", 97, { nao_contatar_em: "2026-10-01" }),
      lead("h", "c1", 95, { etapa: "fechado" }),
      lead("x", "c1", 100, { grupo_id: "outro" }),
    ],
    corretores: [
      { id: "c1", nome: "Carol", grupo_id: G },
      { id: "c2", nome: "Davi", grupo_id: G },
    ],
  }).cliente;
}

describe("leads_mais_quentes", () => {
  it("corretor: só os dele, em andamento, pela nota; arquivado, quem pediu para sair, fechado e outro grupo ficam fora", async () => {
    const r = (await leadsMaisQuentes(corretor, {}, banco())) as { leads: { cliente: string; nota: number }[] };
    expect(r.leads.map((l) => l.cliente)).toEqual(["Cliente a", "Cliente c"]);
  });

  it("gestor: a imobiliária inteira, com o dono de cada um", async () => {
    const r = (await leadsMaisQuentes(gestor, { quantos: 2 }, banco())) as { leads: { cliente: string; corretor?: string }[] };
    expect(r.leads).toMatchObject([
      { cliente: "Cliente a", corretor: "Carol" },
      { cliente: "Cliente b", corretor: "Davi" },
    ]);
  });

  it("quantos tem teto (10)", async () => {
    const muitos = (await leadsMaisQuentes(gestor, { quantos: 50 }, banco())) as { leads: unknown[] };
    expect(muitos.leads.length).toBeLessThanOrEqual(TETO_DOS_MAIS_QUENTES);
    const um = (await leadsMaisQuentes(gestor, { quantos: 1 }, banco())) as { leads: unknown[] };
    expect(um.leads).toHaveLength(1);
  });

  it("sem nota calculada: diz que ainda não há", async () => {
    const vazio = bancoFalso({ leads: [lead("d", "c1", null)], corretores: [] }).cliente;
    expect(await leadsMaisQuentes(corretor, {}, vazio)).toMatchObject({ vazio: expect.stringContaining("nota") });
  });
});
