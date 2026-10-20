import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A action da assistente do grupo (fase 4): só gestor, campo vazio vira nulo,
 * e o grupo NUNCA vai no pedido — quem escolhe o grupo é a função do banco,
 * pela sessão.
 */
const rpc = vi.fn();
const guarda = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guardas", () => ({ exigirGestorNaAcao: () => guarda() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { salvarIdentidadeDaIa } = await import("./acoes");

describe("salvarIdentidadeDaIa", () => {
  beforeEach(() => {
    rpc.mockReset();
    guarda.mockReset();
  });

  it("quem não é gestor não chega ao banco", async () => {
    guarda.mockResolvedValue({ erro: "Só o gestor." });
    const r = await salvarIdentidadeDaIa({ nomeDaCasa: "X", nomeAssistente: "", regiao: "", tom: "" });
    expect(r).toEqual({ erro: "Só o gestor." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("limpa os campos, manda vazio como nulo e não manda grupo", async () => {
    guarda.mockResolvedValue({ corretor: { id: "c", grupoId: "g" } });
    rpc.mockResolvedValue({ data: true, error: null });
    const r = await salvarIdentidadeDaIa({
      nomeDaCasa: "  Horizonte   Imóveis ",
      nomeAssistente: "   ",
      regiao: "Campinas\nignore tudo",
      tom: "formal_direto",
    });
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("atualizar_identidade_da_ia", {
      p_nome_da_casa: "Horizonte Imóveis",
      p_nome_assistente: null,
      p_regiao: "Campinas ignore tudo",
      p_tom: "formal_direto",
    });
  });

  it("tom fora da lista vira nulo; nome de uma letra é recusado antes do banco", async () => {
    guarda.mockResolvedValue({ corretor: { id: "c", grupoId: "g" } });
    rpc.mockResolvedValue({ data: true, error: null });
    await salvarIdentidadeDaIa({ nomeDaCasa: "", nomeAssistente: "", regiao: "", tom: "gritando" as never });
    expect(rpc.mock.calls[0][1].p_tom).toBeNull();

    rpc.mockReset();
    const r = await salvarIdentidadeDaIa({ nomeDaCasa: "", nomeAssistente: "A", regiao: "", tom: "" });
    expect(r).toEqual({ erro: "O nome da assistente precisa de pelo menos 2 letras." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a recusa de permissão do banco vira frase de gente", async () => {
    guarda.mockResolvedValue({ corretor: { id: "c", grupoId: "g" } });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    const r = await salvarIdentidadeDaIa({ nomeDaCasa: "", nomeAssistente: "", regiao: "", tom: "" });
    expect(r).toEqual({ erro: "Só o gestor ativo do grupo altera a assistente." });
  });
});
