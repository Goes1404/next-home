import { describe, expect, it } from "vitest";
import { problemaDaPalavraChave, problemasDasPalavrasChave } from "./palavraChaveDiscreta";
import { contemPalavraChave, listarPalavrasChave, palavraDoCorretorNaMensagem } from "./modoBot";

describe("palavra-chave discreta (regra N8)", () => {
  it("recusa palavra curta", () => {
    expect(problemaDaPalavraChave("assu")).toMatch(/curta demais/);
  });

  it("recusa expressão comum de conversa, mesmo com pontuação", () => {
    expect(problemaDaPalavraChave("obrigado")).toMatch(/comum/);
    expect(problemaDaPalavraChave("Bom dia!")).toMatch(/comum/);
    expect(problemaDaPalavraChave("ok obrigado")).toMatch(/comum/);
    expect(problemaDaPalavraChave("combinado..")).toMatch(/comum/);
  });

  it("aceita frase rara mas natural", () => {
    expect(problemaDaPalavraChave("vou te passar os detalhes..")).toBeNull();
    expect(problemaDaPalavraChave("deixa comigo então")).toBeNull();
  });

  it("aceita emoji incomum sozinho e recusa o de todo dia", () => {
    expect(problemaDaPalavraChave("🗝️")).toBeNull();
    expect(problemaDaPalavraChave("👍")).toMatch(/emoji/);
  });

  it("a palavra já cadastrada continua passando no salvar", () => {
    expect(problemasDasPalavrasChave("ok!, deixa comigo então", "ok!")).toEqual([]);
    expect(problemasDasPalavrasChave("ok!, oi", "ok!")).toHaveLength(1);
  });
});

describe("palavra do corretor na mensagem", () => {
  it("a de teste é conferida primeiro", () => {
    expect(
      palavraDoCorretorNaMensagem({
        mensagem: "modo teste agora, vou te passar os detalhes..",
        palavraChaveConfigurada: "vou te passar os detalhes..",
        palavraChaveTeste: "modo teste agora",
      }),
    ).toBe("teste");
  });

  it("ativação sem diferença de maiúscula e acento", () => {
    expect(
      palavraDoCorretorNaMensagem({
        mensagem: "Deixa Comigo Entao",
        palavraChaveConfigurada: "deixa comigo então",
      }),
    ).toBe("ativacao");
  });

  it("emoji sozinho vale como palavra-chave na hora de casar", () => {
    expect(listarPalavrasChave("🗝️")).toEqual(["🗝️"]);
    expect(contemPalavraChave("Já te mando 🗝️", "🗝️")).toBe(true);
  });
});
