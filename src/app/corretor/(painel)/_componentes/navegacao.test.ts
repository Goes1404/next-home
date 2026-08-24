import { describe, expect, it } from "vitest";
import {
  ATALHOS_MOBILE,
  GRUPOS_NAV,
  gruposVisiveis,
  itemAtivo,
  rotaAtiva,
} from "./navegacao";

describe("mapa de navegação (roadmap: 7 destinos)", () => {
  it("corretor comum vê no máximo 7 destinos", () => {
    const itens = gruposVisiveis(false).flatMap((g) => g.itens);
    expect(itens.length).toBeLessThanOrEqual(7);
  });

  it("gestor vê os 7 + o bloco de administração", () => {
    const doGestor = gruposVisiveis(true).flatMap((g) => g.itens);
    const doCorretor = gruposVisiveis(false).flatMap((g) => g.itens);
    expect(doGestor.length).toBeGreaterThan(doCorretor.length);
    expect(doGestor.some((i) => i.href === "/corretor/admin")).toBe(true);
  });

  it("toda rota absorvida (`tambem`) pertence a exatamente um destino", () => {
    const absorvidas = GRUPOS_NAV.flatMap((g) => g.itens).flatMap((i) => i.tambem ?? []);
    expect(new Set(absorvidas).size).toBe(absorvidas.length);
  });
});

describe("rotaAtiva", () => {
  it("Início só acende na rota exata — é prefixo de todas as outras", () => {
    expect(rotaAtiva("/corretor", "/corretor")).toBe(true);
    expect(rotaAtiva("/corretor/leads", "/corretor")).toBe(false);
  });

  it("as demais acendem por prefixo (editor de imóvel mantém Imóveis aceso)", () => {
    expect(rotaAtiva("/corretor/imoveis/vista-alphagran", "/corretor/imoveis")).toBe(true);
  });
});

describe("itemAtivo", () => {
  const leads = ATALHOS_MOBILE.find((i) => i.href === "/corretor/leads")!;

  it("acende na própria rota", () => {
    expect(itemAtivo("/corretor/leads", leads)).toBe(true);
  });

  it("acende nas rotas que absorveu (funil, visitas, importar)", () => {
    expect(itemAtivo("/corretor/funil", leads)).toBe(true);
    expect(itemAtivo("/corretor/visitas", leads)).toBe(true);
    expect(itemAtivo("/corretor/importar", leads)).toBe(true);
  });

  it("não acende em rota alheia", () => {
    expect(itemAtivo("/corretor/campanhas", leads)).toBe(false);
    expect(itemAtivo(null, leads)).toBe(false);
  });
});
