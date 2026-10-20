import { describe, expect, it } from "vitest";
import { destinoDoPorteiro } from "./destinoDoPorteiro";

const texto = (d: ReturnType<typeof destinoDoPorteiro>) =>
  d.tipo === "whatsapp" ? (new URL(d.url).searchParams.get("text") ?? "") : "";

describe("para onde o porteiro manda", () => {
  it("com telefone e imóvel, abre o WhatsApp com a mensagem do imóvel", () => {
    const d = destinoDoPorteiro({ telefone: "5511999999999", nomeImovel: "Terra Alta", intencao: "visita", nomeDoSite: "Next Home" });
    expect(d.tipo === "whatsapp" && d.url).toContain("wa.me/5511999999999");
    expect(texto(d)).toContain("Gostaria de mais informações do Terra Alta. Quero agendar uma visita.");
  });

  it("sem imóvel, manda a frase geral do site", () => {
    const d = destinoDoPorteiro({ telefone: "5511999999999", nomeImovel: null, intencao: null, nomeDoSite: "Next Home" });
    expect(texto(d)).toContain("Vim pelo site da Next Home.");
  });

  it("sem ninguém conectado, escapa para o contato, não para a página do imóvel", () => {
    expect(destinoDoPorteiro({ telefone: null, nomeImovel: "Terra Alta", intencao: null, nomeDoSite: "Next Home" })).toEqual({
      tipo: "escape",
      caminho: "/contato",
    });
  });

  it("telefone curto demais conta como ninguém conectado", () => {
    expect(destinoDoPorteiro({ telefone: "551199", nomeImovel: null, intencao: null, nomeDoSite: "Next Home" }).tipo).toBe("escape");
  });

  it("emenda o complemento DEPOIS da frase reconhecida, com teto", () => {
    const d = destinoDoPorteiro({
      telefone: "5511999999999",
      nomeImovel: null,
      intencao: null,
      nomeDoSite: "Next Home",
      complemento: "Simulei: renda R$ 8.000.   " + "x".repeat(1000),
    });
    const t = texto(d);
    expect(t.startsWith("Olá! Vim pelo site da Next Home. Simulei: renda R$ 8.000. x")).toBe(true);
    expect(t.length).toBeLessThan(500);
  });

  it("no site de outro grupo, a frase geral leva o nome DELE, e o porteiro a reconhece", async () => {
    const { reconhecerConviteDeEntrada } = await import("./porteiro");
    const d = destinoDoPorteiro({ telefone: "5511999999999", nomeImovel: null, intencao: "visita", nomeDoSite: "Imobiliária B" });
    expect(texto(d)).toBe("Olá! Vim pelo site da Imobiliária B. Quero agendar uma visita.");
    expect(texto(d)).not.toMatch(/next home/i);
    expect(reconhecerConviteDeEntrada({ texto: texto(d), palavrasEntradaCliente: null })?.via).toBe("mensagem_do_site");
  });
});
