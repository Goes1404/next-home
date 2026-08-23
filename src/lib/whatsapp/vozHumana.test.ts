import { describe, expect, it } from "vitest";
import { formatarParaWhatsapp, removerAberturaDeRobo, soarHumano } from "./vozHumana";
import { classificarTamanho, dividirEmMensagens } from "./chunking";

describe("Formatação que o WhatsApp entende", () => {
  it("negrito de markdown vira negrito de WhatsApp", () => {
    // O caso real de produção: o cliente recebeu "**Vista AlphaGran**" com
    // os quatro asteriscos à mostra, porque o WhatsApp usa UM só.
    expect(formatarParaWhatsapp("O **Vista AlphaGran** é alto padrão")).toBe(
      "O *Vista AlphaGran* é alto padrão",
    );
  });

  it("lista com marcador vira travessão", () => {
    // Também de produção: "*   **Vista AlphaGran** (Barueri): ..."
    const bruto = "Temos:\n*   **Vista AlphaGran** (Barueri)\n*   **Vitra** (Alphaville)";
    const limpo = formatarParaWhatsapp(bruto);
    expect(limpo).not.toMatch(/^\s*\*\s{2,}/m);
    expect(limpo).toContain("— *Vista AlphaGran* (Barueri)");
  });

  it("lista numerada também vira travessão", () => {
    expect(formatarParaWhatsapp("1. Canvas\n2. Vitra")).toBe("— Canvas\n— Vitra");
  });

  it("cabeçalho markdown some", () => {
    expect(formatarParaWhatsapp("## Opções\nCanvas")).toBe("Opções\nCanvas");
  });

  it("link markdown fica só com o texto — a URL vai como anexo nativo", () => {
    expect(formatarParaWhatsapp("veja a [planta](https://x.com/p.jpg) aqui")).toBe(
      "veja a planta aqui",
    );
  });

  it("não estraga um asterisco de negrito que já estava certo", () => {
    expect(formatarParaWhatsapp("O *Canvas* é lindo")).toBe("O *Canvas* é lindo");
  });
});

describe("Aberturas de robô", () => {
  it("corta 'Excelente pergunta!' e mantém o conteúdo", () => {
    const r = removerAberturaDeRobo("Excelente pergunta! O Canvas tem 3 suítes e lazer completo.");
    expect(r).toBe("O Canvas tem 3 suítes e lazer completo.");
  });

  it("corta 'Entendi!' do começo", () => {
    expect(removerAberturaDeRobo("Entendi! Você procura algo pronto para morar em Alphaville.")).toBe(
      "Você procura algo pronto para morar em Alphaville.",
    );
  });

  it("NÃO corta quando sobraria quase nada — balão vazio é pior que clichê", () => {
    expect(removerAberturaDeRobo("Claro!")).toBe("Claro!");
  });

  it("deixa em paz um texto que já começa natural", () => {
    const texto = "O Canvas fica a 5 minutos do Tamboré, com 3 suítes.";
    expect(removerAberturaDeRobo(texto)).toBe(texto);
  });
});

describe("Peneira completa + quebra", () => {
  it("a resposta real de produção sai legível e em balões do tamanho certo", () => {
    // Texto reconstruído a partir do que a IA mandou de verdade.
    const bruto =
      "Entendi! Você busca ver as plantas dos imóveis. No nosso catálogo, temos algumas opções com plantas disponíveis para você visualizar:\n" +
      "*   **Vista AlphaGran** (Alphagran Alphaville, Barueri): Um alto padrão em construção, para quem busca exclusividade.\n" +
      "*   **More Aldeia de Barueri** (Jardim Timbauhy, Barueri): Pronto para morar, a poucos minutos do shopping e da estação.\n" +
      "*   **Vitra Alphaville** (Dezoito do Forte, Barueri): Pronto para morar, unindo sofisticação e conforto.\n" +
      "Gostaria de te enviar as plantas de algum desses empreendimentos para você conhecer melhor?";

    const limpo = soarHumano(bruto);

    expect(limpo).not.toContain("**");
    expect(limpo).not.toMatch(/^\s*\*\s{2,}/m);
    expect(limpo.startsWith("Entendi!")).toBe(false);

    for (const balao of dividirEmMensagens(limpo)) {
      expect(classificarTamanho(balao)).not.toBe("longa");
    }
  });
});

describe("Corte em fronteira de oração", () => {
  /*
   * Flagrado em teste com a API real: o cliente recebeu "…pronta para" e
   * "morar, ideal para…" em balões separados. O quebrador tinha só dois
   * níveis — fim de frase, ou QUALQUER espaço — então frase sem ponto final
   * caía direto no segundo. Cortar no meio de "pronta para morar" não
   * parece pessoa digitando rápido, parece software quebrado.
   */
  it("não termina balão em palavra que pede complemento", () => {
    const texto =
      "O Bosque AlphaGran é uma casa em condomínio fechado, pronta para morar, " +
      "ideal para quem busca conforto e segurança em Alphaville";
    const baloes = dividirEmMensagens(texto);
    expect(baloes.length).toBeGreaterThan(1);
    for (const balao of baloes) {
      expect(balao).not.toMatch(/\b(para|de|da|do|em|com|que|uma?|no|na)$/i);
    }
  });

  it("continua preferindo o fim de frase quando ele existe", () => {
    const texto =
      "O Canvas fica a cinco minutos do Tamboré. A entrega está prevista para janeiro de 2027. " +
      "As unidades têm três suítes e duas vagas na garagem do prédio.";
    for (const balao of dividirEmMensagens(texto).slice(0, -1)) {
      expect(balao).toMatch(/[.!?]$/);
    }
  });
});
