import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = {
  papel: "gestor" as "gestor" | "corretor",
  visita: null as Record<string, unknown> | null,
  destino: null as Record<string, unknown> | null,
  erroUpdate: null as { code: string; message: string } | null,
  updates: [] as Record<string, unknown>[],
  avisos: [] as [string, string][],
  filtros: [] as [string, unknown][],
};

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/guardas", () => ({
  exigirGestorNaAcao: async () =>
    estado.papel === "gestor"
      ? { corretor: { id: "gestor-1", grupoId: "g1", papel: "gestor" } }
      : { erro: "Esta ação é restrita a quem administra a imobiliária." },
}));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, id: string, texto: string) => (estado.avisos.push([id, texto]), true),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      const cadeia = {
        select: () => cadeia,
        insert: async () => ({ error: null }),
        update: (dados: Record<string, unknown>) => (estado.updates.push(dados), cadeia),
        eq: (c: string, v: unknown) => (estado.filtros.push([`${tabela}.${c}`, v]), cadeia),
        maybeSingle: async () => ({ data: tabela === "visitas" ? estado.visita : estado.destino, error: null }),
        then: (r: (x: { error: unknown }) => unknown) => r({ error: estado.erroUpdate }),
      };
      return cadeia;
    },
  }),
}));

const { passarVisita } = await import("./acoesDaEquipe");

const amanha = () => new Date(Date.now() + 86_400_000).toISOString();

describe("passarVisita", () => {
  beforeEach(() => {
    estado.papel = "gestor";
    estado.visita = {
      id: "v1",
      inicio: amanha(),
      lead_id: "l1",
      corretor_id: "a",
      status: "marcada",
      lead: { nome: "Ana", corretor_id: "a" },
    };
    estado.destino = { id: "b", nome: "Bruno", ativo: true };
    estado.erroUpdate = null;
    estado.updates = [];
    estado.avisos = [];
    estado.filtros = [];
  });

  it("corretor comum não passa visita", async () => {
    estado.papel = "corretor";
    expect((await passarVisita("v1", "b")).erro).toMatch(/restrita/);
    expect(estado.updates).toEqual([]);
  });

  it("procura a visita só no grupo do gestor", async () => {
    estado.visita = null;
    expect((await passarVisita("v1", "b")).erro).toBe("Essa visita não pode mais ser passada.");
    expect(estado.filtros).toContainEqual(["visitas.grupo_id", "g1"]);
  });

  it("visita que já começou não é passada", async () => {
    estado.visita = { ...estado.visita!, inicio: new Date(Date.now() - 3_600_000).toISOString() };
    expect((await passarVisita("v1", "b")).erro).toBe("Essa visita não pode mais ser passada.");
  });

  it("passa a B, marca como passada e avisa os dois", async () => {
    expect(await passarVisita("v1", "b")).toEqual({});
    expect(estado.updates[0]).toMatchObject({ corretor_id: "b", passada_por: "gestor-1" });
    expect(estado.updates[0].passada_em).toEqual(expect.any(String));
    expect(estado.avisos.map((a) => a[0]).sort()).toEqual(["a", "b"]);
    expect(estado.filtros).toContainEqual(["corretores.grupo_id", "g1"]);
  });

  it("devolver ao dono do lead zera a passagem", async () => {
    estado.visita = { ...estado.visita!, corretor_id: "b" };
    estado.destino = { id: "a", nome: "Ana Corretora", ativo: true };
    await passarVisita("v1", "a");
    expect(estado.updates[0]).toMatchObject({ corretor_id: "a", passada_em: null, passada_por: null });
  });

  it("conflito na agenda de quem recebe vira mensagem clara e ninguém é avisado", async () => {
    estado.erroUpdate = { code: "23P01", message: "conflicting key value violates exclusion constraint" };
    expect((await passarVisita("v1", "b")).erro).toBe("Esse corretor já tem outra visita nesse horário.");
    expect(estado.avisos).toEqual([]);
  });

  it("destino inativo ou de fora do grupo é recusado", async () => {
    estado.destino = null;
    expect((await passarVisita("v1", "x")).erro).toBe("Escolha um corretor ativo da equipe.");
  });
});
