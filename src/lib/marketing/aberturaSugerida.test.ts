import { describe, expect, it } from "vitest";
import { aberturasDoJson, problemaDaAbertura, promptDeAberturas } from "./aberturaSugerida";

describe("aberturas sugeridas pela IA", () => {
  it("o prompt leva a régua medida da casa e pede ângulos diferentes", () => {
    const p = promptDeAberturas({ imovel: "Vitra", bairro: "Alphaville", publico: "leads parados" });
    expect(p).toContain("{nome}");
    expect(p).toMatch(/sem valor/);
    expect(p).toMatch(/DUAS versões com ângulos DIFERENTES/);
  });

  it("aceita abertura curta, com nome, terminando em pergunta", () => {
    expect(problemaDaAbertura("Oi {nome}! Saiu o decorado do Vitra. Quer ver as fotos?")).toBeNull();
  });

  it("recusa valor, texto longo, sem nome e sem pergunta", () => {
    expect(problemaDaAbertura("Oi {nome}, o Vitra sai por R$ 480 mil. Quer ver?")).toBe("fala valor");
    expect(problemaDaAbertura(`Oi {nome}! ${"a".repeat(230)}?`)).toBe("longa demais");
    expect(problemaDaAbertura("Oi! Quer ver as fotos?")).toBe("sem o nome");
    expect(problemaDaAbertura("Oi {nome}, saiu o decorado.")).toBe("não termina em pergunta");
  });

  it("descarta o par se uma falhar ou se as duas forem iguais", () => {
    const boa = "Oi {nome}! Quer ver o decorado?";
    expect(aberturasDoJson({ a: boa, b: "Oi {nome}, tudo bem? Ainda procura em Alphaville?" })).not.toBeNull();
    expect(aberturasDoJson({ a: boa, b: boa })).toBeNull();
    expect(aberturasDoJson({ a: boa, b: "sem nome e sem pergunta" })).toBeNull();
    expect(aberturasDoJson("texto")).toBeNull();
  });
});
