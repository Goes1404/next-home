import { describe, expect, it } from "vitest";
import { imoveisQueCombinam, leadsQueCombinam, pontuarImovel, temPressaDeMudar, type ImovelParaMatch } from "./matchDeImoveis";

/** Match de imóveis × leads (29/10/2026). */

const imovel = (p: Partial<ImovelParaMatch> & { id: string }): ImovelParaMatch => ({
  cidade: "Barueri",
  bairro: "Alphaville",
  precoAPartir: 500_000,
  dormitorios: [2, 3],
  status: "em_construcao",
  ...p,
});

describe("pontuarImovel", () => {
  it("sem critério nenhum, não combina com nada (nem 'com tudo')", () => {
    expect(pontuarImovel({}, imovel({ id: "a" }))).toBeNull();
  });

  it("critério declarado que o imóvel não atende reprova", () => {
    expect(pontuarImovel({ regiaoInteresse: "Cotia" }, imovel({ id: "a" }))).toBeNull();
    expect(pontuarImovel({ dormitoriosMin: 4 }, imovel({ id: "a" }))).toBeNull();
    // 10% de folga: 560 mil para quem disse 500 passa; 600 não.
    expect(pontuarImovel({ orcamentoMax: 500_000 }, imovel({ id: "a", precoAPartir: 600_000 }))).toBeNull();
  });

  it("região, dormitórios e orçamento somam, com os motivos", () => {
    const m = pontuarImovel({ regiaoInteresse: "Alphaville", dormitoriosMin: 3, orcamentoMax: 550_000 }, imovel({ id: "a" }));
    expect(m?.pontos).toBe(40 + 30 + 30 + 10 + 5);
    expect(m?.motivos).toEqual([
      "região (Alphaville)",
      "3+ dormitórios",
      "cabe no orçamento",
      "perto do teto do orçamento",
      "planta com 3 dormitórios",
    ]);
  });

  it("o imóvel que o lead pediu entra mesmo reprovando um critério, e na frente", () => {
    const m = pontuarImovel({ regiaoInteresse: "Cotia", pediu: ["a"] }, imovel({ id: "a" }));
    expect(m).not.toBeNull();
    expect(m!.motivos[0]).toBe("é o imóvel que ele pediu");
    expect(m!.pontos).toBe(50);
  });

  it("com pressa: pronto para morar sobe, lançamento desce", () => {
    const base = { regiaoInteresse: "Barueri", temPressa: true };
    const pronto = pontuarImovel(base, imovel({ id: "p", status: "pronto_para_morar" }))!;
    const lancamento = pontuarImovel(base, imovel({ id: "l", status: "lancamento" }))!;
    expect(pronto.pontos).toBe(55);
    expect(pronto.motivos).toContain("pronto para morar (tem pressa)");
    expect(lancamento.pontos).toBe(30);
  });

  it("muito abaixo do orçamento MÍNIMO declarado perde pontos", () => {
    const m = pontuarImovel({ regiaoInteresse: "Barueri", orcamentoMin: 1_000_000 }, imovel({ id: "a", precoAPartir: 400_000 }))!;
    expect(m.pontos).toBe(30);
  });

  it("sem orçamento declarado, a renda vira teto (e o motivo diz isso)", () => {
    const m = pontuarImovel({ tetoPelaRenda: 520_000 }, imovel({ id: "a" }))!;
    expect(m.motivos).toContain("cabe no que a renda financia");
  });
});

describe("imoveisQueCombinam", () => {
  const catalogo = [
    imovel({ id: "caro", precoAPartir: 800_000 }),
    imovel({ id: "certo", precoAPartir: 480_000 }),
    imovel({ id: "barato", precoAPartir: 200_000 }),
    imovel({ id: "longe", cidade: "Cotia", bairro: "Granja Viana" }),
    imovel({ id: "pedido", cidade: "Cotia", bairro: "Centro" }),
  ];

  it("ordena pelos pontos, tira o que não combina e respeita o limite", () => {
    const r = imoveisQueCombinam({ regiaoInteresse: "Barueri", orcamentoMax: 520_000, pediu: ["pedido"] }, catalogo, 5);
    expect(r.map((x) => x.id)).toEqual(["certo", "barato", "pedido"]);
    expect(imoveisQueCombinam({ regiaoInteresse: "Barueri", orcamentoMax: 520_000 }, catalogo, 1).map((x) => x.id)).toEqual([
      "certo",
    ]);
  });

  it("empate de pontos: o mais barato primeiro", () => {
    const r = imoveisQueCombinam({ regiaoInteresse: "Barueri" }, [imovel({ id: "x", precoAPartir: 900 }), imovel({ id: "y", precoAPartir: 100 })]);
    expect(r.map((x) => x.id)).toEqual(["y", "x"]);
  });
});

describe("leadsQueCombinam", () => {
  it("só os leads que combinam, do melhor para o pior", () => {
    const leads = [
      { id: "1", regiao: "Alphaville", dorms: 3 },
      { id: "2", regiao: "Cotia", dorms: null },
      { id: "3", regiao: "Barueri", dorms: null },
      { id: "4", regiao: null, dorms: null },
    ];
    const r = leadsQueCombinam(imovel({ id: "a" }), leads, (l) => ({ regiaoInteresse: l.regiao, dormitoriosMin: l.dorms }));
    expect(r.map((l) => l.id)).toEqual(["1", "3"]);
  });
});

describe("temPressaDeMudar", () => {
  it("lê o texto livre do dossiê", () => {
    for (const t of ["Urgente", "mudança imediata", "quer mudar já", "o quanto antes", "este mês"]) expect(temPressaDeMudar(t), t).toBe(true);
    for (const t of [null, "", "sem pressa", "ano que vem", "não tem pressa, só pesquisando", "janeiro"]) {
      expect(temPressaDeMudar(t), String(t)).toBe(false);
    }
  });
});
