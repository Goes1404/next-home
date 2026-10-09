import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aberturasDoJson, problemaDaAbertura, promptDeAberturas } from "./aberturaSugerida";

describe("aberturas sugeridas pela IA", () => {
  it("o prompt leva a régua medida da casa e pede ângulos diferentes", () => {
    const p = promptDeAberturas({ imovel: "Vitra", bairro: "Alphaville", publico: "leads parados" });
    // Sem o nome (09/10/2026): o corretor apagava o marcador de toda sugestão.
    expect(p).toMatch(/não use o nome da pessoa nem o marcador \{nome\}/);
    expect(p).not.toMatch(/comece pelo nome/);
    expect(p).toMatch(/sem valor/);
    expect(p).toMatch(/DUAS versões com ângulos DIFERENTES/);
  });

  it("aceita abertura curta terminando em pergunta, sem precisar do nome", () => {
    expect(problemaDaAbertura("Oi! Saiu o decorado do Vitra. Quer ver as fotos?")).toBeNull();
  });

  it("recusa valor, texto longo e sem pergunta", () => {
    expect(problemaDaAbertura("Oi, o Vitra sai por R$ 480 mil. Quer ver?")).toBe("fala valor");
    expect(problemaDaAbertura(`Oi! ${"a".repeat(230)}?`)).toBe("longa demais");
    expect(problemaDaAbertura("Oi, saiu o decorado.")).toBe("não termina em pergunta");
  });

  it("se a IA puser {nome} mesmo assim, ele sai sem deixar buraco", () => {
    expect(
      aberturasDoJson({ a: "Oi {nome}! Quer ver o decorado?", b: "Oi {nome}, tudo bem? Ainda procura em Alphaville?" }),
    ).toEqual({ a: "Oi! Quer ver o decorado?", b: "Oi, tudo bem? Ainda procura em Alphaville?" });
  });

  it("descarta o par se uma falhar ou se as duas forem iguais", () => {
    const boa = "Oi! Quer ver o decorado?";
    expect(aberturasDoJson({ a: boa, b: "Tudo bem? Ainda procura em Alphaville?" })).not.toBeNull();
    expect(aberturasDoJson({ a: boa, b: boa })).toBeNull();
    expect(aberturasDoJson({ a: boa, b: "sem nome e sem pergunta" })).toBeNull();
    expect(aberturasDoJson("texto")).toBeNull();
  });
});

describe("vencedoras de A/B como exemplo", () => {
  it("entram no prompt como tom, no máximo três", () => {
    const p = promptDeAberturas({ imovel: "Vitra", publico: "leads" }, ["Oi {nome}! 1?", "Oi {nome}! 2?", "Oi {nome}! 3?", "Oi {nome}! 4?"]);
    expect(p).toMatch(/VENCERAM/);
    // As vencedoras antigas tinham o marcador: entram sem ele, para a IA não imitar.
    expect(p).toContain("- Oi! 3?");
    expect(p).not.toContain("Oi! 4?");
    expect(p).not.toContain("Oi {nome}");
  });

  it("sem vencedora, o prompt não fala delas", () => {
    expect(promptDeAberturas({ imovel: "Vitra", publico: "leads" })).not.toMatch(/VENCERAM/);
  });
});

describe("texto pré-pronto da lista", () => {
  // O corretor apagava o marcador toda vez (09/10/2026).
  it("a mensagem que já vem escrita não traz {nome}", () => {
    const tela = readFileSync("src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx", "utf8");
    const padrao = tela.match(/const MENSAGEM_PADRAO =\s*"([^"]*)"/)?.[1];
    expect(padrao).toBeTruthy();
    expect(padrao).not.toContain("{nome}");
  });
});
