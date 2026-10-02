import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { PARAMETROS_PADRAO } from "@/lib/credito/parametrosPadrao";
import {
  blocoDeCapacidade,
  escolherPorCapacidade,
  rendaDaFala,
  rendaNaConversa,
  tetoDeCompra,
} from "./capacidadeDeCompra";

const imovel = (nome: string, precoAPartir: number | null, cidade = "Barueri", dormitorios: number[] = [2]) =>
  ({
    nome,
    slug: nome.toLowerCase().replace(/\s+/g, "-"),
    precoAPartir,
    cidade,
    bairro: "Centro",
    tipo: "apartamento",
    tipologias: dormitorios.map((d) => ({ dormitorios: d })),
  }) as unknown as Empreendimento;

describe("a renda que o cliente disse", () => {
  it("lê os jeitos de escrever renda", () => {
    expect(rendaDaFala("minha renda é 2.500", false)).toBe(2500);
    expect(rendaDaFala("ganho uns 5 mil por mês", false)).toBe(5000);
    expect(rendaDaFala("5,5 mil", true)).toBe(5500);
    expect(rendaDaFala("8k", true)).toBe(8000);
    expect(rendaDaFala("6000", true)).toBe(6000);
  });

  it("soma quando ele diz que soma", () => {
    expect(rendaDaFala("eu ganho 3 mil e minha esposa 2 mil, somando", false)).toBe(5000);
  });

  it("soma quando cita outra pessoa da casa (produção, 01/10/2026)", () => {
    expect(rendaDaFala("1500 do meu marido e 2644 meu", true)).toBe(4144);
    // "junto com os 1500 dele" SOMA à renda dita antes: o regex não sabe somar
    // entre falas, então não lê nada e fica a da ficha (a extração somou 4144).
    expect(rendaDaFala("Junto com meu esposo de 1500", false)).toBeNull();
  });

  it("aluguel e preço de imóvel não são renda", () => {
    expect(rendaDaFala("pago 900 de aluguel", true)).toBeNull();
    expect(rendaDaFala("vi um de 400 mil", false)).toBeNull();
    expect(rendaDaFala("quero 3 dormitórios", true)).toBeNull();
  });

  it("número solto só conta se a IA acabou de perguntar a renda", () => {
    expect(rendaDaFala("uns 4 mil", false)).toBeNull();
    const historico = [{ remetente: "bot", texto: "Qual é a renda média da família por mês?" }];
    expect(rendaNaConversa(historico, "uns 4 mil")).toBe(4000);
  });
});

describe("o teto de compra", () => {
  it("sai da renda pela conta do simulador", () => {
    const t = tetoDeCompra({ rendaMensal: 2500 }, PARAMETROS_PADRAO);
    expect(t?.origem).toBe("renda");
    expect(t!.valor).toBeGreaterThan(100000);
    expect(t!.valor).toBeLessThan(400000);
  });

  it("o orçamento que ele disse vence", () => {
    expect(tetoDeCompra({ rendaMensal: 2500, orcamentoMax: 500000 }, PARAMETROS_PADRAO)).toEqual({
      valor: 500000,
      origem: "orcamento",
      renda: 2500,
    });
  });

  it("sem renda nem orçamento, não há teto", () => {
    expect(tetoDeCompra({}, PARAMETROS_PADRAO)).toBeNull();
  });
});

describe("a indicação usa o teto", () => {
  const catalogo = [imovel("Caro", 800000), imovel("Sem Piso", null), imovel("Cabe", 250000)];
  const renda = (valor: number) => ({ valor, origem: "renda" as const, renda: 2500 });

  it("o bloco nomeia quem cabe e proíbe dizer o valor ao cliente", () => {
    const b = blocoDeCapacidade(renda(300000), escolherPorCapacidade(catalogo, 300000));
    expect(b).toMatch(/CABEM e combinam com o que ele pediu: Cabe/);
    expect(b).toMatch(/NÃO diga esse valor/);
    expect(b).toMatch(/sem valor cadastrado/);
  });

  it("sem nenhum que cabe, nomeia o MAIS PERTO em vez de deixar o modelo escolher", () => {
    const b = blocoDeCapacidade(renda(100000), escolherPorCapacidade(catalogo, 100000));
    expect(b).toMatch(/NENHUM/);
    expect(b).toMatch(/MAIS PERTO são: Cabe, Caro/);
  });

  // A conversa real de 01/10/2026: renda de R$ 4.144, teto de ~R$ 251 mil,
  // Barueri e 2 dormitórios. A IA indicou o de R$ 457 mil e depois o de 480.
  const real = [
    imovel("Vila Eco Park Osasco", 249000, "Osasco"),
    imovel("Breeze Home Clube", 349900),
    imovel("Griffe Barueri", 449900),
    imovel("Viva RSF Vila do Conde", 457000, "Barueri", [1, 2, 3]),
    imovel("Dom Parque", 480000, "Barueri", []),
    imovel("Bit Barueri", 560000, "Barueri", [3]),
  ];

  it("sem nada na região, o mais perto é o mais barato DA REGIÃO, e a outra cidade aparece como fora do pedido", () => {
    const e = escolherPorCapacidade(real, 251000, { regiao: "Barueri", dormitorios: 2 });
    expect(e.cabem).toEqual([]);
    expect(e.cabemForaDoPedido.map((i) => i.nome)).toEqual(["Vila Eco Park Osasco"]);
    const b = blocoDeCapacidade(renda(251000), e);
    expect(b).toMatch(/fora do pedido: Vila Eco Park Osasco/);
  });

  it("com a folga da entrada, o Breeze cabe e vem antes de qualquer outro", () => {
    const e = escolherPorCapacidade(real, 360000, { regiao: "Barueri", dormitorios: 2 });
    expect(e.cabem.map((i) => i.nome)).toEqual(["Breeze Home Clube"]);
  });

  it("nada cabe em lugar nenhum: os mais perto são os mais baratos do pedido", () => {
    const e = escolherPorCapacidade(real, 200000, { regiao: "Barueri", dormitorios: 2 });
    expect(e.maisPerto.map((i) => i.nome)).toEqual(["Breeze Home Clube", "Griffe Barueri"]);
  });

  it("os dormitórios filtram, mas imóvel sem planta cadastrada não é descartado", () => {
    const e = escolherPorCapacidade(real, 500000, { regiao: "Barueri", dormitorios: 3 });
    expect(e.cabem.map((i) => i.nome)).toEqual(["Dom Parque", "Viva RSF Vila do Conde"]);
  });
});

describe("o teto pela renda pesa no ranking do prompt", () => {
  it("o que cabe sobe, sem passar a outra cidade na frente da que ele pediu", async () => {
    const { ranquearCatalogo } = await import("./catalogoRelevante");
    const lista = [
      imovel("Bit Barueri", 560000, "Barueri", [3]),
      imovel("Dom Parque", 480000),
      imovel("Vila Eco Park Osasco", 249000, "Osasco"),
      imovel("Breeze Home Clube", 349900),
    ];
    const r = ranquearCatalogo({
      catalogo: lista,
      mensagemAtual: "2644",
      dossie: { regiaoInteresse: "Barueri", dormitoriosMin: 2 } as never,
      tetoPelaRenda: 251000,
    });
    expect(r[0].nome).toBe("Breeze Home Clube");
    expect(r.findIndex((e) => e.nome === "Vila Eco Park Osasco")).toBeLessThan(
      r.findIndex((e) => e.nome === "Dom Parque"),
    );
  });
});
