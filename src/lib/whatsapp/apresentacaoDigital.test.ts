import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { decidirApresentacao, garantirLinkDaPagina } from "./apresentacaoDigital";
import { sanearRespostaIA } from "./guardrails";
import { linkDaPagina } from "./resolverMidia";

function imovel(slug: string): Empreendimento {
  return {
    nome: slug,
    slug,
    tagline: "",
    descricao: "",
    bairro: "Alphaville",
    cidade: "Barueri",
    status: "lancamento",
    tipo: "apartamento",
    finalidade: "lancamento",
    precoAPartir: null,
    capa: { url: `https://cdn.x/${slug}/capa.jpg`, tipo: "foto", alt: "" },
    plantas: [],
    videos: [],
    lazer: [],
    tipologias: [],
  } as unknown as Empreendimento;
}

const catalogo = [imovel("vitra"), imovel("eternity")];

const resposta = (texto: string, anexos: { slug: string; tipo: "foto" | "planta" }[]) => ({
  textoResposta: texto,
  sugerirVisita: false,
  transferirHumano: false,
  imoveisRecomendados: [],
  anexosMidia: anexos,
  visitaProposta: null,
  meta: {
    latenciaMs: 1,
    fallback: false,
    motivoFalha: null,
    modelo: "teste",
    tokensEntrada: null,
    tokensSaida: null,
  },
});

describe("a apresentação digital sai como link da página, nunca como foto", () => {
  it("cliente pede a apresentação e a IA manda foto: sai o link, a foto não", () => {
    const saneada = sanearRespostaIA(
      resposta("Claro! Te mandei as fotos aqui embaixo.", [{ slug: "vitra", tipo: "foto" }]),
      catalogo,
      [],
      null,
      null,
      "me manda a apresentação do Vitra",
    );
    expect(saneada.anexos).toHaveLength(0);
    expect(saneada.resposta.textoResposta).toContain(linkDaPagina("vitra"));
    expect(saneada.resposta.textoResposta).not.toMatch(/fotos aqui embaixo/);
    expect(saneada.apresentacaoComoLink).toBe(true);
  });

  it("a resposta anuncia a apresentação sem o link: o código põe o link", () => {
    const saneada = sanearRespostaIA(
      resposta("Segue a apresentação digital do Eternity!", [{ slug: "eternity", tipo: "foto" }]),
      catalogo,
      [],
    );
    expect(saneada.anexos).toHaveLength(0);
    expect(saneada.resposta.textoResposta).toContain(linkDaPagina("eternity"));
  });

  it("o link certo já no texto não é duplicado", () => {
    const texto = `Olha a apresentação: ${linkDaPagina("vitra")}`;
    const saneada = sanearRespostaIA(resposta(texto, []), catalogo, [], null, null, "tem apresentação?");
    expect(saneada.resposta.textoResposta.split(linkDaPagina("vitra"))).toHaveLength(2);
  });

  it("planta pedida junto continua indo: só a foto sai", () => {
    const d = decidirApresentacao({
      texto: "Segue a apresentação",
      pedidos: [
        { slug: "vitra", tipo: "foto" },
        { slug: "vitra", tipo: "planta" },
      ],
      catalogo,
    });
    expect(d.pedidos).toEqual([{ slug: "vitra", tipo: "planta" }]);
  });

  it("pedido de FOTO continua mandando foto", () => {
    const saneada = sanearRespostaIA(
      resposta("Te mandei as fotos do Vitra aqui embaixo.", [{ slug: "vitra", tipo: "foto" }]),
      catalogo,
      [],
      null,
      null,
      "manda umas fotos do vitra",
    );
    expect(saneada.anexos).toHaveLength(1);
    expect(saneada.apresentacaoComoLink).toBe(false);
  });

  it("sem saber de qual imóvel, não chuta o link", () => {
    const d = decidirApresentacao({
      texto: "Qual imóvel você quer ver? Te mando a apresentação.",
      pedidos: [],
      catalogo,
      falaDoCliente: "me manda a apresentação",
    });
    expect(d.slug).toBeNull();
  });

  it("'material do piso' não é pedido de apresentação", () => {
    const d = decidirApresentacao({
      texto: "O piso eu confirmo com o corretor.",
      pedidos: [{ slug: "vitra", tipo: "foto" }],
      catalogo,
      falaDoCliente: "qual o material do piso?",
    });
    expect(d.slug).toBeNull();
    expect(d.pedidos).toHaveLength(1);
  });

  it("link de página com slug que não existe vira o certo", () => {
    const errado = linkDaPagina("vitra-inventado");
    const r = garantirLinkDaPagina(`Veja: ${errado}`, "vitra", catalogo);
    expect(r.texto).toBe(`Veja: ${linkDaPagina("vitra")}`);
  });
});
