import { describe, expect, it } from "vitest";
import { mensagemDeAnuncio, reconhecerMensagemDeAnuncio, resolverCampanha } from "./porteiro";

const IMOVEIS = [
  {
    id: "1",
    slug: "more-na-aldeia-de-barueri-mac238",
    nome: "More na Aldeia de Barueri",
    nomesAlternativos: ["Manacá", "Manacá Barueri"],
  },
  { id: "2", slug: "terra-alta-ta141", nome: "Terra Alta", nomesAlternativos: [] },
  { id: "3", slug: "vitra-alphaville-vt110", nome: "Vitra Alphaville", nomesAlternativos: null },
];

describe("resolverCampanha — o pedaço da URL vira imóvel", () => {
  it("casa por apelido, que é como a campanha vai se chamar", () => {
    expect(resolverCampanha("manaca", IMOVEIS)?.id).toBe("1");
    expect(resolverCampanha("Manac%C3%A1", IMOVEIS)?.id).toBe("1");
  });

  it("casa por slug e por nome, com hífen ou espaço", () => {
    expect(resolverCampanha("terra-alta-ta141", IMOVEIS)?.id).toBe("2");
    expect(resolverCampanha("terra_alta ta141", IMOVEIS)?.id).toBe("2");
    expect(resolverCampanha("vitra-alphaville", IMOVEIS)?.id).toBe("3");
  });

  it("NÃO faz fuzzy: link com typo falha visível, não acerta quase", () => {
    expect(resolverCampanha("manacaa", IMOVEIS)).toBeNull();
    expect(resolverCampanha("terra", IMOVEIS)).toBeNull();
    expect(resolverCampanha("", IMOVEIS)).toBeNull();
  });
});

describe("mensagem de anúncio — ida e volta", () => {
  it("a mensagem gerada é reconhecida de volta pelo webhook", () => {
    const msg = mensagemDeAnuncio("More na Aldeia de Barueri");
    expect(reconhecerMensagemDeAnuncio(msg)).toBe("more na aldeia de barueri");
  });

  it("sobrevive ao que o WhatsApp faz com o texto: caixa e acento", () => {
    expect(reconhecerMensagemDeAnuncio("olá! gostaria de mais informações do MANACÁ.")).toBe(
      "manaca",
    );
    expect(reconhecerMensagemDeAnuncio("Ola gostaria de mais informacoes do Terra Alta")).toBe(
      "terra alta",
    );
  });

  it("fala pessoal NÃO é reconhecida — a trava protege o número do corretor", () => {
    for (const texto of [
      "oi, tudo bem?",
      "Olá! Gostaria de saber se você vai no aniversário",
      "gostaria de mais informações", // sem imóvel
      null,
      "",
    ]) {
      expect(reconhecerMensagemDeAnuncio(texto), String(texto)).toBeNull();
    }
  });

  it("texto longo não passa — mensagem pronta de anúncio é curta", () => {
    const longa = `Olá! Gostaria de mais informações do imóvel ${"que vi ontem ".repeat(12)}`;
    expect(reconhecerMensagemDeAnuncio(longa)).toBeNull();
  });
});
