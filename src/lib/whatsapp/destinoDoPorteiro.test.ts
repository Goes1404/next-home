import { describe, expect, it } from "vitest";
import { destinoDoPorteiro } from "./destinoDoPorteiro";

const texto = (d: ReturnType<typeof destinoDoPorteiro>) =>
  d.tipo === "whatsapp" ? (new URL(d.url).searchParams.get("text") ?? "") : "";

describe("para onde o porteiro manda", () => {
  it("com telefone e imóvel, abre o WhatsApp com a mensagem do imóvel", () => {
    const d = destinoDoPorteiro({ telefone: "5511999999999", nomeImovel: "Terra Alta", intencao: "visita" });
    expect(d.tipo === "whatsapp" && d.url).toContain("wa.me/5511999999999");
    expect(texto(d)).toContain("Gostaria de mais informações do Terra Alta. Quero agendar uma visita.");
  });

  it("sem imóvel, manda a frase geral do site", () => {
    const d = destinoDoPorteiro({ telefone: "5511999999999", nomeImovel: null, intencao: null });
    expect(texto(d)).toContain("Vim pelo site da Next Home.");
  });

  it("sem ninguém conectado, escapa para o contato, não para a página do imóvel", () => {
    expect(destinoDoPorteiro({ telefone: null, nomeImovel: "Terra Alta", intencao: null })).toEqual({
      tipo: "escape",
      caminho: "/contato",
    });
  });

  it("telefone curto demais conta como ninguém conectado", () => {
    expect(destinoDoPorteiro({ telefone: "551199", nomeImovel: null, intencao: null }).tipo).toBe("escape");
  });

  it("emenda o complemento DEPOIS da frase reconhecida, com teto", () => {
    const d = destinoDoPorteiro({
      telefone: "5511999999999",
      nomeImovel: null,
      intencao: null,
      complemento: "Simulei: renda R$ 8.000.   " + "x".repeat(1000),
    });
    const t = texto(d);
    expect(t.startsWith("Olá! Vim pelo site da Next Home. Simulei: renda R$ 8.000. x")).toBe(true);
    expect(t.length).toBeLessThan(500);
  });
});
