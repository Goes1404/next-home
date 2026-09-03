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

describe("mapa de navegação (três destinos no polegar, e é de propósito)", () => {
  it("a barra do polegar leva no máximo 3 destinos", () => {
    // Mais o botão "Menu" = 4 alvos. Medido em 320px, o pior caso real: com
    // cinco alvos cada um fica com 62px; com quatro, 78px. Barra fixa não
    // rola, então alvo apertado ali não fica feio, fica difícil de acertar.
    expect(ATALHOS_MOBILE.length).toBeLessThanOrEqual(3);
    expect(ATALHOS_MOBILE.map((i) => i.href)).toEqual([
      "/corretor",
      "/corretor/pessoas",
      "/corretor/imoveis",
    ]);
  });

  it("a gaveta NÃO repete a barra — ela existe para o que não cabe lá", () => {
    /*
     * Esta é a regra que a versão anterior violava sem que nada avisasse: a
     * gaveta renderizava `gruposVisiveis`, que era literalmente o mesmo array
     * de `ATALHOS_MOBILE`. Para o corretor comum ela mostrava os quatro
     * botões que o polegar já tinha embaixo — um toque para ver o que já
     * estava na tela. O comentário do componente prometia "o painel inteiro".
     */
    const naGaveta = gruposVisiveis(false).flatMap((g) => g.itens.map((i) => i.href));
    const naBarra = new Set(ATALHOS_MOBILE.map((i) => i.href));
    const exclusivos = naGaveta.filter((h) => !naBarra.has(h));
    expect(exclusivos.length).toBeGreaterThan(0);
  });

  it("Pessoas é uma porta só: leads e conversas são a mesma pessoa", () => {
    /*
     * 91 dos 116 leads têm conversa; 91 das 127 conversas têm lead. Enquanto
     * foram dois destinos, a primeira decisão que o painel pedia era "por
     * qual porta eu falo com o Fulano?" — a pergunta que ninguém responde sem
     * treino.
     */
    const itens = gruposVisiveis(false).flatMap((g) => g.itens);
    const pessoas = itens.find((i) => i.href === "/corretor/pessoas");
    expect(pessoas).toBeDefined();
    expect(pessoas?.tambem).toContain("/corretor/leads");
    expect(pessoas?.tambem).toContain("/corretor/conversas");
    expect(itens.some((i) => i.href === "/corretor/leads")).toBe(false);
    expect(itens.some((i) => i.href === "/corretor/conversas")).toBe(false);
  });

  it("o menu inteiro cabe numa olhada", () => {
    // Sete é o teto: acima disso o menu deixa de ser lido e passa a ser
    // procurado, que é o começo do labirinto.
    expect(gruposVisiveis(true).flatMap((g) => g.itens).length).toBeLessThanOrEqual(7);
  });

  it("Conta e senha NÃO são itens de menu — moram no menu do avatar", () => {
    const itens = gruposVisiveis(true).flatMap((g) => g.itens);
    expect(itens.some((i) => i.href === "/corretor/perfil")).toBe(false);
    expect(itens.some((i) => i.href === "/corretor/senha")).toBe(false);
    expect(ITENS_DA_CONTA.map((i) => i.href)).toEqual(["/corretor/perfil", "/corretor/senha"]);
  });

  it("gestor vê exatamente um destino a mais, e é Administração", () => {
    const doGestor = gruposVisiveis(true).flatMap((g) => g.itens);
    const doCorretor = gruposVisiveis(false).flatMap((g) => g.itens);

    expect(doGestor.length).toBe(doCorretor.length + 1);
    expect(doGestor.some((i) => i.href === "/corretor/admin")).toBe(true);
    // Contas, leads da equipe e preços são ABAS de Administração.
    expect(doGestor.some((i) => i.href === "/corretor/admin/contas")).toBe(false);
    expect(doGestor.some((i) => i.href === "/corretor/admin/precos")).toBe(false);
  });

  it("toda rota absorvida (`tambem`) pertence a exatamente um destino", () => {
    const absorvidas = GRUPOS_NAV.flatMap((g) => g.itens).flatMap((i) => i.tambem ?? []);
    expect(new Set(absorvidas).size).toBe(absorvidas.length);
  });

  it("a barra do polegar é DERIVADA do menu, não uma segunda lista", () => {
    expect(ATALHOS_MOBILE).toBe(GRUPOS_NAV[0].itens);
  });
});

describe("moduloAtivo — a chave do color coding", () => {
  it("cada destino resolve para o seu módulo", () => {
    expect(moduloAtivo("/corretor")).toBe("inicio");
    expect(moduloAtivo("/corretor/pessoas")).toBe("leads");
    expect(moduloAtivo("/corretor/imoveis")).toBe("imoveis");
    // Campanhas mudou de dono: disparo é peça de saída, e Marketing reúne o
    // que produz com o que dispara. A rota continua respondendo; só a cor e o
    // item de menu que a acende mudaram.
    expect(moduloAtivo("/corretor/campanhas")).toBe("marketing");
    expect(moduloAtivo("/corretor/marketing")).toBe("marketing");
    expect(moduloAtivo("/corretor/perfil")).toBe("conta");
    expect(moduloAtivo("/corretor/admin")).toBe("admin");
  });

  it("rota absorvida herda a cor do destino que a absorveu", () => {
    // Leads e Conversas são Pessoas agora: mesma cor, porque é a mesma coisa.
    expect(moduloAtivo("/corretor/leads")).toBe("leads");
    expect(moduloAtivo("/corretor/conversas")).toBe("leads");
    expect(moduloAtivo("/corretor/visitas")).toBe("leads");
    // Templates e Links foram junto: os dois são insumo de peça, não de ficha.
    expect(moduloAtivo("/corretor/templates")).toBe("marketing");
    expect(moduloAtivo("/corretor/links")).toBe("marketing");
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
  const leads = ATALHOS_MOBILE.find((i) => i.href === "/corretor/pessoas")!;

  it("acende na própria rota", () => {
    expect(itemAtivo("/corretor/pessoas", leads)).toBe(true);
  });

  it("acende nas rotas que absorveu (leads, conversas, importar)", () => {
    expect(itemAtivo("/corretor/leads", leads)).toBe(true);
    expect(itemAtivo("/corretor/conversas", leads)).toBe(true);
    expect(itemAtivo("/corretor/importar", leads)).toBe(true);
  });

  it("não acende em rota alheia", () => {
    expect(itemAtivo("/corretor/campanhas", leads)).toBe(false);
    expect(itemAtivo(null, leads)).toBe(false);
  });
});
