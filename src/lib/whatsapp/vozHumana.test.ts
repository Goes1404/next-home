import { describe, expect, it } from "vitest";
import {
  formatarParaWhatsapp,
  removerAberturaDeRobo,
  removerCumprimentoRepetido,
  soarHumano,
} from "./vozHumana";
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

/*
 * Produção, 28/09/2026: "Que bom receber seu oi!" como primeira resposta, e
 * "Oi Matheus, tudo bem?" de novo no terceiro turno, no meio da conversa.
 * Pessoa cumprimenta uma vez; quem cumprimenta a cada mensagem é robô.
 */
describe("Cumprimento repetido no meio da conversa", () => {
  const conversando = [
    { remetente: "bot", texto: "Oi Matheus, tudo bem? Aqui é a Lia, da Next Home." },
    { remetente: "cliente", texto: "Na aldeia" },
  ];

  it("tira o cumprimento quando o bot já falou e o cliente respondeu", () => {
    expect(
      removerCumprimentoRepetido("Oi Matheus, tudo bem? --- Quer conhecer o decorado do Royal?", conversando),
    ).toBe("Quer conhecer o decorado do Royal?");
    expect(
      removerCumprimentoRepetido("Bom dia, Matheus! Na Aldeia tenho o Royal Barueri II.", conversando),
    ).toBe("Na Aldeia tenho o Royal Barueri II.");
    expect(removerCumprimentoRepetido("Oi! Tenho sim, na Aldeia o Serenne.", conversando)).toBe(
      "Tenho sim, na Aldeia o Serenne.",
    );
  });

  it("a primeira mensagem da conversa cumprimenta normalmente", () => {
    const texto = "Oi Matheus, tudo bem? Aqui é a Lia, da Next Home.";
    expect(removerCumprimentoRepetido(texto, [])).toBe(texto);
    expect(removerCumprimentoRepetido(texto, [{ remetente: "cliente", texto: "Oi" }])).toBe(texto);
  });

  it("o retorno depois do silêncio do cliente pode cumprimentar", () => {
    const texto = "Oi Matheus, tudo bem? Passando pra saber se ficou alguma dúvida do Royal.";
    const ultimaDoBot = [...conversando, { remetente: "bot", texto: "Te mandei a apresentação." }];
    expect(removerCumprimentoRepetido(texto, ultimaDoBot)).toBe(texto);
  });

  it("não corta quando o cumprimento é a resposta inteira", () => {
    expect(removerCumprimentoRepetido("Oi Matheus, tudo bem?", conversando)).toBe("Oi Matheus, tudo bem?");
  });

  it("a primeira palavra da resposta não é tomada por nome", () => {
    expect(removerCumprimentoRepetido("Oi, tenho sim um de 2 dormitórios na Aldeia.", conversando)).toBe(
      "Tenho sim um de 2 dormitórios na Aldeia.",
    );
  });

  it("palavra que só começa igual não é cumprimento", () => {
    const texto = "Oito unidades ainda estão disponíveis no Royal.";
    expect(removerCumprimentoRepetido(texto, conversando)).toBe(texto);
  });
});

describe("Abertura que agradece o oi", () => {
  it("\"Que bom receber seu oi!\" sai", () => {
    expect(removerAberturaDeRobo("Que bom receber seu oi! Em qual região de Barueri você procura?")).toBe(
      "Em qual região de Barueri você procura?",
    );
    expect(removerAberturaDeRobo("Que bom receber sua mensagem! Tenho sim, na Aldeia.")).toBe(
      "Tenho sim, na Aldeia.",
    );
  });

  it("\"Que bom que gostou\" é gente falando e fica", () => {
    const texto = "Que bom que gostou! O Royal tem decorado aberto no sábado.";
    expect(removerAberturaDeRobo(texto)).toBe(texto);
  });
});
