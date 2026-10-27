import { describe, expect, it, vi } from "vitest";

/*
 * O cartão do Início é acessório: se a leitura da agenda falhar (deploy antes
 * da 0222, cache de schema, rede), ele some — nunca derruba o Início inteiro
 * pelo error.tsx do painel (revisão final da Agenda, 27/10/2026).
 */
vi.mock("@/lib/agenda/lerAgenda", () => ({
  lerItensDoDia: vi.fn(async () => {
    throw new Error("relation \"visitas\" does not exist");
  }),
}));

const { HojeNaAgenda } = await import("./HojeNaAgenda");

describe("HojeNaAgenda", () => {
  it("falha na leitura não lança: o cartão some", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(HojeNaAgenda({ corretorId: "c1", grupoId: "g1" })).resolves.toBeNull();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
