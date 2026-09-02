import { describe, expect, it } from "vitest";
import {
  ATALHOS_MOBILE,
  GRUPOS_NAV,
  ITENS_DA_CONTA,
  gruposVisiveis,
  itemAtivo,
  moduloAtivo,
  rotaAtiva,
} from "./navegacao";

describe("mapa de navegação (o menu tem quatro destinos, e é de propósito)", () => {
  it("corretor comum vê no máximo 4 destinos", () => {
    const itens = gruposVisiveis(false).flatMap((g) => g.itens);
    expect(itens.length).toBeLessThanOrEqual(4);
  });

  it("Conta e senha NÃO são itens de menu — moram no menu do avatar", () => {
    // Era o destino menos visitado ocupando um slot de cinco. O slot foi para
    // Imóveis, na barra do polegar; conta e senha vivem em ITENS_DA_CONTA.
    const itens = gruposVisiveis(true).flatMap((g) => g.itens);
    expect(itens.some((i) => i.href === "/corretor/perfil")).toBe(false);
    expect(itens.some((i) => i.href === "/corretor/senha")).toBe(false);
    expect(ITENS_DA_CONTA.map((i) => i.href)).toEqual([
      "/corretor/perfil",
      "/corretor/senha",
    ]);
  });

  it("gestor vê os mesmos 4 mais Administração — nunca as telas de admin soltas", () => {
    const doGestor = gruposVisiveis(true).flatMap((g) => g.itens);
    const doCorretor = gruposVisiveis(false).flatMap((g) => g.itens);

    expect(doGestor.length).toBe(doCorretor.length + 1);
    expect(doGestor.some((i) => i.href === "/corretor/admin")).toBe(true);
    // Contas, leads da equipe e WhatsApp da equipe são ABAS de Administração.
    expect(doGestor.some((i) => i.href === "/corretor/admin/contas")).toBe(false);
    expect(doGestor.some((i) => i.href === "/corretor/admin/precos")).toBe(false);
  });

  it("WhatsApp é um destino só — conversas, campanhas e IA são abas dele", () => {
    const itens = gruposVisiveis(false).flatMap((g) => g.itens);
    const whatsapp = itens.find((i) => i.label === "WhatsApp");

    expect(whatsapp).toBeDefined();
    expect(whatsapp?.tambem).toContain("/corretor/campanhas");
    expect(whatsapp?.tambem).toContain("/corretor/whatsapp");
    expect(itens.filter((i) => i.href === "/corretor/campanhas")).toHaveLength(0);
  });

  it("toda rota absorvida (`tambem`) pertence a exatamente um destino", () => {
    const absorvidas = GRUPOS_NAV.flatMap((g) => g.itens).flatMap((i) => i.tambem ?? []);
    expect(new Set(absorvidas).size).toBe(absorvidas.length);
  });

  it("a barra do polegar leva os QUATRO destinos de trabalho, Imóveis incluso", () => {
    // Imóveis não cabia no celular e só existia atrás da gaveta, embora seja
    // a tela que o corretor abre no meio de uma conversa para mandar foto.
    expect(ATALHOS_MOBILE.map((i) => i.href)).toEqual([
      "/corretor",
      "/corretor/leads",
      "/corretor/conversas",
      "/corretor/imoveis",
    ]);
  });

  it("a barra do polegar é DERIVADA do menu, não uma segunda lista", () => {
    // Eram duas listas mantidas iguais à mão, com os mesmos `tambem` escritos
    // duas vezes: bastava absorver uma rota nova em um lugar e esquecer do
    // outro para o item apagar no celular e acender no computador.
    expect(ATALHOS_MOBILE).toBe(GRUPOS_NAV[0].itens);
  });
});

describe("moduloAtivo — a chave do color coding", () => {
  it("cada destino resolve para o seu módulo", () => {
    expect(moduloAtivo("/corretor")).toBe("inicio");
    expect(moduloAtivo("/corretor/leads")).toBe("leads");
    expect(moduloAtivo("/corretor/conversas")).toBe("whatsapp");
    expect(moduloAtivo("/corretor/imoveis")).toBe("imoveis");
    expect(moduloAtivo("/corretor/perfil")).toBe("conta");
    expect(moduloAtivo("/corretor/admin")).toBe("admin");
  });

  it("rota absorvida herda a cor do destino que a absorveu", () => {
    expect(moduloAtivo("/corretor/funil")).toBe("leads");
    expect(moduloAtivo("/corretor/campanhas")).toBe("whatsapp");
    expect(moduloAtivo("/corretor/links")).toBe("imoveis");
    expect(moduloAtivo("/corretor/senha")).toBe("conta");
  });

  it("sub-rota profunda mantém a cor do módulo", () => {
    expect(moduloAtivo("/corretor/imoveis/vista-alphagran/importar")).toBe("imoveis");
    expect(moduloAtivo("/corretor/leads/abc-123")).toBe("leads");
  });

  it("o mais específico ganha: /corretor/admin/precos é admin, não Início", () => {
    // `/corretor` casa exato, mas se um dia deixasse de casar, o item mais
    // longo tem de ser o dono — senão a tela de preços ficaria com a cor do
    // Início.
    expect(moduloAtivo("/corretor/admin/precos")).toBe("admin");
  });

  it("fora do painel não inventa cor", () => {
    expect(moduloAtivo(null)).toBe(null);
    expect(moduloAtivo("/empreendimentos")).toBe(null);
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
