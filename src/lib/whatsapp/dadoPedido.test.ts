import { describe, expect, it } from "vitest";
import { blocoDadoPedido, dadoPedido } from "./dadoPedido";
import type { Empreendimento } from "@/lib/types";

const IMOVEL = {
  slug: "terra-alta",
  nome: "Terra Alta Barueri",
  status: "em_construcao",
  cidade: "Barueri",
  bairro: "Jardim Tupanci",
  endereco: "Rua das Palmeiras, 100",
  precoAPartir: 470000,
  entregaPrevista: null,
  lazer: ["Piscina", "Academia", "Salão de festas"],
  tipologias: [
    { nome: "2 dorm", areaPrivativa: 63, dormitorios: 2, suites: 1, banheiros: 2, vagas: 1, preco: null, plantaUrl: null, unidadesDisponiveis: null },
    { nome: "3 dorm", areaPrivativa: 81, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, preco: null, plantaUrl: null, unidadesDisponiveis: null },
  ],
} as unknown as Empreendimento;

const SEM_PISO = { ...IMOVEL, nome: "Sem Piso", precoAPartir: null } as Empreendimento;
const CATALOGO = [IMOVEL, { ...IMOVEL, precoAPartir: 249000 } as Empreendimento];

const pedir = (mensagem: string, imovel: Empreendimento | null = IMOVEL) =>
  dadoPedido({ mensagem, imovel, catalogo: CATALOGO });

describe("dadoPedido — preço", () => {
  it("responde o piso do imóvel em foco", () => {
    expect(pedir("qual o valor?")?.resposta).toBe("a partir de R$ 470.000");
  });

  it("trata pedido de DESCONTO como pergunta de preço", () => {
    // Quem pergunta desconto está perguntando quanto custa, e a resposta
    // certa começa pelo piso. Foi a persona que travou por 12 turnos.
    expect(pedir("qual o desconto pra pagamento a vista?")?.tipo).toBe("preco");
  });

  it("sem foco, responde o piso mais baixo do CATÁLOGO", () => {
    // "Nossos lançamentos começam a partir de X" é a resposta honesta de
    // quem ainda não sabe qual imóvel interessa. Bem melhor que "depende".
    const d = pedir("quanto custa?", null);
    expect(d?.resposta).toBe("o mais em conta do nosso catálogo começa em R$ 249.000");
    expect(d?.imovel).toBeNull();
  });

  it("sem piso cadastrado, não inventa — não devolve nada", () => {
    expect(dadoPedido({ mensagem: "qual o valor?", imovel: SEM_PISO, catalogo: [SEM_PISO] })).toBeNull();
  });
});

describe("dadoPedido — dados do imóvel", () => {
  it("metragem sai das tipologias, como faixa", () => {
    expect(pedir("qual a metragem?")?.resposta).toBe("de 63 a 81 m²");
  });

  it("tipologia traz dormitórios, suítes e vagas", () => {
    expect(pedir("quantos quartos tem?")?.resposta).toBe("2 e 3 dormitórios, até 1 suíte, 2 vagas");
  });

  it("entrega usa o RÓTULO humano, nunca o enum cru", () => {
    // Com `em_construcao` na ficha o modelo já afirmou a um cliente que o
    // imóvel estava "pronto para morar".
    expect(pedir("quando fica pronto?")?.resposta).toBe("Em construção");
  });

  it("entrega só cita data quando ela existe", () => {
    const comData = { ...IMOVEL, entregaPrevista: "dez/2027" } as Empreendimento;
    expect(dadoPedido({ mensagem: "qual o prazo?", imovel: comData, catalogo: CATALOGO })?.resposta)
      .toContain("dez/2027");
  });

  it("sem foco, dado de imóvel específico NÃO responde", () => {
    // "quantos metros?" contra dez fichas seria escolher por ele.
    expect(pedir("qual a metragem?", null)).toBeNull();
  });
});

describe("dadoPedido — quando NÃO agir", () => {
  it("mensagem sem pergunta de dado não dispara", () => {
    expect(pedir("bom dia, tudo bem?")).toBeNull();
    expect(pedir("pode ser sábado de manhã")).toBeNull();
  });
});

describe("blocoDadoPedido", () => {
  it("nomeia o imóvel e manda dizer o dado sem trocar por 'depende'", () => {
    const bloco = blocoDadoPedido(pedir("qual o valor?")!);
    expect(bloco).toContain("O Terra Alta Barueri a partir de R$ 470.000.");
    expect(bloco).toMatch(/NUNCA o número/);
    // A saída depois do dado importa tanto quanto o dado: bloco que só
    // manda responder deixa a conversa parada no fato.
    expect(bloco).toMatch(/uma pergunta só|convite para a visita/);
  });

  it("sem imóvel em foco, fala dos lançamentos e não de 'esse'", () => {
    const bloco = blocoDadoPedido(pedir("quanto custa?", null)!);
    expect(bloco).toContain("R$ 249.000");
    // Frase pronta, não dado solto: a primeira versão entregava o dado e o
    // modelo respondeu "o valor a partir de cada imóvel é o que temos".
    expect(bloco).toMatch(/^"?O mais em conta/m);
  });
});
