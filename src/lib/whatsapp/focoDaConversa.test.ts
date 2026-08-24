import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { catalogoComFoco, detectarFoco } from "./focoDaConversa";
import { construirPromptSistema, type ContextoAtendimento } from "./aiAgent";

/**
 * Os nomes daqui são os do catálogo REAL de produção, feios de propósito:
 * três "Lançamento ao Lado do Parque" com slugs diferentes, um "Melhor
 * valor de metro da Região" e um "More na Aldeia de Barueri". Testar com
 * nomes bonitos inventados esconderia justamente o caso que quebra.
 */
function imovel(nome: string, slug: string, extra: Partial<Empreendimento> = {}): Empreendimento {
  return {
    nome,
    slug,
    bairro: "Jardim Tupanci",
    cidade: "Barueri",
    status: "em_construcao",
    tipo: "apartamento",
    descricao: "",
    tagline: "",
    midias: [],
    ...extra,
  } as unknown as Empreendimento;
}

const CATALOGO = [
  imovel("Terra Alta", "terra-alta-ta141"),
  imovel("Vitra Alphaville", "vitra-alphaville-vt110"),
  imovel("Eternity Alphaville Tamboré", "eternity-alphaville"),
  imovel("Lançamento ao Lado do Parque", "lancamento-ao-lado-do-parque-ne93837"),
  imovel("Lançamento ao Lado do Parque", "lancamento-ao-lado-do-parque-ne38370"),
  imovel("More na Aldeia de Barueri", "more-na-aldeia-de-barueri-mac238"),
  imovel("Viva RSF Vila do Conde", "viva-rsf-vila-do-conde"),
];

/**
 * O catálogo real, com os dois problemas que aparecem em conversa de
 * verdade: cadastro em triplicata do mesmo empreendimento (Dom Parque) e
 * nome comercial que só existe no apelido (Manacá).
 */
const CATALOGO_REAL = [
  imovel("Terra Alta", "terra-alta-ta141", { construtora: "MAC", bairro: "Jardim Tupanci" }),
  imovel("Vitra Alphaville", "vitra-alphaville-vt110", { construtora: "Vitra", bairro: "Dezoito do Forte" }),
  imovel("Lançamento ao Lado do Parque", "lancamento-ao-lado-do-parque-ne93837", {
    construtora: "P4 ENGENHARIA",
    bairro: "Jardim Tupanci",
    nomesAlternativos: ["Dom Parque"],
    midias: [{ url: "a" }, { url: "b" }] as unknown as Empreendimento["midias"],
  }),
  imovel("Lançamento ao Lado do Parque", "lancamento-ao-lado-do-parque-ne38370", {
    construtora: "P4 ENGENHARIA",
    bairro: "Jardim Tupanci",
    nomesAlternativos: ["Dom Parque"],
  }),
  imovel("Lançamento ao Lado do Parque", "lancamento-ao-lado-do-parque-ne51970", {
    construtora: "P4 ENGENHARIA",
    bairro: "Jardim Tupanci",
    nomesAlternativos: ["Dom Parque"],
  }),
  imovel("More na Aldeia de Barueri", "more-na-aldeia-de-barueri-mac238", {
    construtora: "RSF Empreendimentos",
    bairro: "Jardim Iracema",
    nomesAlternativos: ["Manacá", "Manacá Barueri"],
  }),
];

describe("variação de escrita do nome", () => {
  const foco = (texto: string) => detectarFoco({ catalogo: CATALOGO_REAL, mensagemAtual: texto })?.imovel.slug ?? null;

  it("erro de digitação no meio da palavra", () => {
    expect(foco("quero saber do vitra alphavile")).toBe("vitra-alphaville-vt110");
    expect(foco("me fala do Vitra Alphaviile")).toBe("vitra-alphaville-vt110");
  });

  it("letras trocadas de lugar — o erro de quem digita rápido no celular", () => {
    expect(foco("gostei do vrita alphaville")).toBe("vitra-alphaville-vt110");
  });

  it("nome escrito tudo junto ou com hífen", () => {
    expect(foco("manda fotos do terraalta")).toBe("terra-alta-ta141");
    expect(foco("quero o terra-alta")).toBe("terra-alta-ta141");
  });

  it("sem acento e em caixa qualquer", () => {
    expect(foco("QUERO INFORMAÇÕES DO MANACA")).toBe("more-na-aldeia-de-barueri-mac238");
  });

  it("nome comercial que não está no campo nome — o caso do Dom Parque", () => {
    expect(foco("Gostaria de informações do Dom parque")).toBe("lancamento-ao-lado-do-parque-ne93837");
  });

  it("apelido em triplicata escolhe o cadastro mais completo, não desiste por ambiguidade", () => {
    // Os três cadastros são o mesmo empreendimento; o de mais mídias vence.
    expect(foco("dom parque tem quantos dormitórios?")).toBe("lancamento-ao-lado-do-parque-ne93837");
  });

  it("apelido do cadastro real: manacá barueri", () => {
    expect(foco("Quero informações do manacá Barueri")).toBe("more-na-aldeia-de-barueri-mac238");
  });

  it("NÃO inventa foco por palavra parecida", () => {
    for (const texto of [
      "quero algo de alta qualidade",
      "prefiro uma vista boa",
      "tem algo mais alto?",
      "quero saber do Joy Barueri",
      "moro perto do parque",
    ]) {
      expect(foco(texto), texto).toBeNull();
    }
  });

  it("nome completo do cadastro, com preposições e tudo", () => {
    expect(foco("quero saber do Lançamento ao Lado do Parque")).toBe(
      "lancamento-ao-lado-do-parque-ne93837",
    );
  });

  it("erro grande demais não casa — dois nomes distantes não são o mesmo imóvel", () => {
    expect(foco("quero saber do terravista")).toBeNull();
  });

  it("as reservas nunca trazem um cadastro gêmeo do foco", () => {
    const detectado = detectarFoco({ catalogo: CATALOGO_REAL, mensagemAtual: "quero o dom parque" })!;
    const lista = catalogoComFoco(CATALOGO_REAL, detectado);
    const gemeos = lista.filter((e) => e.nome === "Lançamento ao Lado do Parque");
    expect(gemeos).toHaveLength(1);
  });
});

describe("detectarFoco", () => {
  it("pega o imóvel citado na mensagem de agora", () => {
    const foco = detectarFoco({ catalogo: CATALOGO, mensagemAtual: "gostei do Terra Alta" });
    expect(foco?.imovel.slug).toBe("terra-alta-ta141");
    expect(foco?.origem).toBe("mensagem");
  });

  it("aceita o apelido — ninguém digita o nome de cadastro", () => {
    const foco = detectarFoco({ catalogo: CATALOGO, mensagemAtual: "quero saber do Eternity" });
    expect(foco?.imovel.slug).toBe("eternity-alphaville");
  });

  it("lembra do imóvel citado antes quando a mensagem de agora não cita nenhum", () => {
    const foco = detectarFoco({
      catalogo: CATALOGO,
      mensagemAtual: "e quantos dormitórios tem?",
      historico: [
        { remetente: "cliente", texto: "quero saber do Vitra Alphaville" },
        { remetente: "bot", texto: "Claro! O Vitra é pronto para morar." },
      ],
    });
    expect(foco?.imovel.slug).toBe("vitra-alphaville-vt110");
    expect(foco?.origem).toBe("historico");
  });

  it("ignora o que o BOT cita — senão o foco seria sempre o último imóvel que ela empurrou", () => {
    const foco = detectarFoco({
      catalogo: CATALOGO,
      mensagemAtual: "e tem lazer?",
      historico: [
        { remetente: "cliente", texto: "quero saber do Terra Alta" },
        { remetente: "bot", texto: "Temos também o Vitra Alphaville e o Eternity, quer ver?" },
      ],
    });
    expect(foco?.imovel.slug).toBe("terra-alta-ta141");
  });

  it("a menção mais recente do cliente vence — ele mudou de assunto", () => {
    const foco = detectarFoco({
      catalogo: CATALOGO,
      mensagemAtual: "manda a planta",
      historico: [
        { remetente: "cliente", texto: "gostei do Terra Alta" },
        { remetente: "bot", texto: "Ótimo!" },
        { remetente: "cliente", texto: "na verdade me fala do Vitra" },
      ],
    });
    expect(foco?.imovel.slug).toBe("vitra-alphaville-vt110");
  });

  it("recusa não vira foco", () => {
    const foco = detectarFoco({ catalogo: CATALOGO, mensagemAtual: "não gostei do Terra Alta" });
    expect(foco).toBeNull();
  });

  it("recusa só anula o nome da MESMA frase", () => {
    const foco = detectarFoco({
      catalogo: CATALOGO,
      mensagemAtual: "não gostei do Terra Alta. Me fala do Vitra Alphaville",
    });
    expect(foco?.imovel.slug).toBe("vitra-alphaville-vt110");
  });

  it("apelido compartilhado por imóveis DIFERENTES continua ambíguo", () => {
    // Cadastros gêmeos se fundem (ver CATALOGO_REAL); imóveis distintos que
    // dividem um apelido, não — chutar aqui faria a IA falar do errado.
    const catalogo = [
      imovel("Torre Norte", "torre-norte", { construtora: "A", nomesAlternativos: ["Residencial Aurora"] }),
      imovel("Torre Sul", "torre-sul", { construtora: "B", nomesAlternativos: ["Residencial Aurora"] }),
    ];
    expect(detectarFoco({ catalogo, mensagemAtual: "quero o Residencial Aurora" })).toBeNull();
  });

  it("palavra genérica não vira apelido de imóvel nenhum", () => {
    for (const texto of ["procuro apartamento em Barueri", "quero morar na Aldeia", "tem algo em Alphaville?"]) {
      expect(detectarFoco({ catalogo: CATALOGO, mensagemAtual: texto })).toBeNull();
    }
  });

  it("não casa pedaço de palavra", () => {
    // "Viva" está no catálogo; "vivarium" não é ele.
    expect(detectarFoco({ catalogo: CATALOGO, mensagemAtual: "vi no vivarium ontem" })).toBeNull();
  });

  it("sem imóvel citado, não há foco — é a conversa que ainda está se apresentando", () => {
    expect(detectarFoco({ catalogo: CATALOGO, mensagemAtual: "oi, tudo bem?" })).toBeNull();
  });
});

describe("catalogoComFoco", () => {
  it("sem foco devolve o ranking inteiro: no começo a IA precisa ter opções", () => {
    expect(catalogoComFoco(CATALOGO, null)).toHaveLength(CATALOGO.length);
  });

  it("com foco encolhe para o imóvel escolhido e duas reservas", () => {
    const foco = detectarFoco({ catalogo: CATALOGO, mensagemAtual: "gostei do Terra Alta" })!;
    const lista = catalogoComFoco(CATALOGO, foco);

    expect(lista).toHaveLength(3);
    expect(lista[0].slug).toBe("terra-alta-ta141");
    expect(lista.filter((e) => e.slug === "terra-alta-ta141")).toHaveLength(1);
  });

  it("mantém o foco mesmo se o ranking o tiver cortado (orçamento, urgência)", () => {
    const foco = detectarFoco({ catalogo: CATALOGO, mensagemAtual: "gostei do Terra Alta" })!;
    const rankingSemEle = CATALOGO.filter((e) => e.slug !== "terra-alta-ta141");

    expect(catalogoComFoco(rankingSemEle, foco)[0].slug).toBe("terra-alta-ta141");
  });
});

describe("o foco chega ao prompt", () => {
  const base: ContextoAtendimento = {
    nomeCorretor: "Bruna",
    creciCorretor: "12345",
    telefoneCorretor: "5511999999999",
    nomeAssistente: "Sofia",
    tomVoz: "consultivo_alto_padrao",
    catalogo: CATALOGO,
    historicoMensagens: [],
  };

  it("sem foco não existe bloco de foco nem rótulo de reserva", () => {
    const prompt = construirPromptSistema(base);
    expect(prompt).not.toContain("FOCO DESTA CONVERSA");
    expect(prompt).not.toContain("RESERVA");
  });

  it("com foco, o bloco manda aprofundar e proíbe oferecer outro imóvel", () => {
    const foco = detectarFoco({ catalogo: CATALOGO, mensagemAtual: "gostei do Terra Alta" })!;
    const prompt = construirPromptSistema({
      ...base,
      catalogo: catalogoComFoco(CATALOGO, foco),
      foco: { slug: foco.imovel.slug, nome: foco.imovel.nome },
    });

    expect(prompt).toContain("FOCO DESTA CONVERSA: Terra Alta");
    expect(prompt).toContain("NÃO ofereça outro empreendimento");
    // As alternativas continuam no prompt, mas rotuladas: é o que permite
    // a alternativa honesta da regra 22 sem virar vitrine.
    expect(prompt).toContain("Vitra Alphaville [slug: vitra-alphaville-vt110] (RESERVA");
    expect(prompt).not.toContain("Terra Alta [slug: terra-alta-ta141] (RESERVA");
  });

  it("a regra que impede desfilar imóvel está no prompt", () => {
    const prompt = construirPromptSistema(base);
    expect(prompt).toContain("NO MÁXIMO DOIS IMÓVEIS POR MENSAGEM");
    expect(prompt).toContain("EMPREENDIMENTO QUE NÃO É NOSSO");
  });
});
