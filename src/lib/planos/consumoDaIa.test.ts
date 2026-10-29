import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * O livro do consumo (0233) grava uma linha por chamada paga e nunca derruba
 * quem chamou: o atendimento segue mesmo com o banco recusando a linha.
 */

const insert = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: (tabela: string) => ({ insert: (linha: unknown) => insert(tabela, linha) }) }),
}));

const { registrarConsumoDaIa } = await import("./consumoDaIa");

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
  process.env.SUPABASE_SECRET_KEY = "chave-de-teste";
});

afterEach(() => {
  delete process.env.SUPABASE_SECRET_KEY;
  vi.restoreAllMocks();
});

describe("registrarConsumoDaIa", () => {
  it("grava finalidade, modelo, tokens e o corretor; o grupo fica para o carimbo", async () => {
    await registrarConsumoDaIa(
      { finalidade: "dossie", quemPaga: { corretorId: "c1" } },
      { modelo: "gpt-4.1-mini", tokensEntrada: 1200, tokensSaida: 80 },
    );
    expect(insert).toHaveBeenCalledWith("ia_consumo", {
      corretor_id: "c1",
      finalidade: "dossie",
      modelo: "gpt-4.1-mini",
      tokens_entrada: 1200,
      tokens_saida: 80,
      segundos_de_audio: null,
    });
  });

  it("grupo informado vai junto; duração do áudio com uma casa", async () => {
    await registrarConsumoDaIa(
      { finalidade: "transcricao_audio", quemPaga: { grupoId: "g1" } },
      { modelo: "whisper-large-v3-turbo", segundosDeAudio: 12.345 },
    );
    expect(insert.mock.calls[0][1]).toMatchObject({ grupo_id: "g1", corretor_id: null, segundos_de_audio: 12.3, tokens_entrada: null });
  });

  it("token que não é número válido vira nulo, não lixo no banco", async () => {
    await registrarConsumoDaIa(
      { finalidade: "planta", quemPaga: { corretorId: "c1" } },
      { modelo: "gpt-4.1-mini", tokensEntrada: Number.NaN, tokensSaida: -3 },
    );
    expect(insert.mock.calls[0][1]).toMatchObject({ tokens_entrada: null, tokens_saida: null });
  });

  it("eval (sem grupo) e ambiente sem chave não gravam", async () => {
    await registrarConsumoDaIa({ finalidade: "atendimento", quemPaga: { semGrupo: "eval" } }, { modelo: "gpt-4.1-mini" });
    delete process.env.SUPABASE_SECRET_KEY;
    await registrarConsumoDaIa({ finalidade: "atendimento", quemPaga: { corretorId: "c1" } }, { modelo: "gpt-4.1-mini" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("recusa do banco vai para o log e não lança", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    insert.mockResolvedValue({ error: { message: "grupo_id obrigatório em ia_consumo" } });
    await expect(
      registrarConsumoDaIa({ finalidade: "campanha", quemPaga: { corretorId: "c1" } }, { modelo: "gpt-4.1-mini" }),
    ).resolves.toBeUndefined();
    insert.mockRejectedValue(new Error("rede"));
    await expect(
      registrarConsumoDaIa({ finalidade: "campanha", quemPaga: { corretorId: "c1" } }, { modelo: "gpt-4.1-mini" }),
    ).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalledTimes(2);
  });
});
