import { describe, expect, it, vi } from "vitest";

const leitura = vi.fn();
vi.mock("@/lib/agenda/lerEquipe", () => ({ lerDiaDaEquipe: (...a: unknown[]) => leitura(...a) }));

const { EquipeHoje } = await import("./EquipeHoje");

describe("EquipeHoje", () => {
  it("some sem visita na equipe", async () => {
    leitura.mockResolvedValueOnce({ itens: [], total: 0 });
    await expect(EquipeHoje({ grupoId: "g1" })).resolves.toBeNull();
  });

  it("falha na leitura não derruba o Início", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    leitura.mockRejectedValueOnce(new Error("rede"));
    await expect(EquipeHoje({ grupoId: "g1" })).resolves.toBeNull();
    erro.mockRestore();
  });

  it("lê a equipe toda do grupo da sessão", async () => {
    leitura.mockResolvedValueOnce({ itens: [], total: 0 });
    await EquipeHoje({ grupoId: "g1" });
    expect(leitura).toHaveBeenLastCalledWith(expect.objectContaining({ grupoId: "g1", corretorId: null }));
  });
});
