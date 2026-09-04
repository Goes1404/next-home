import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATALHOS_MOBILE,
  GRUPOS_NAV,
  ITENS_DA_CONTA,
  destinoAtivo,
  gruposVisiveis,
  itemAtivo,
  moduloAtivo,
  rotaAtiva,
  subitensDe,
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

  it("Pessoas é uma porta só: leads e a ficha são a mesma pessoa", () => {
    /*
     * 91 dos 116 leads têm conversa; 91 das 127 conversas têm lead. Enquanto
     * foram dois DESTINOS, a primeira decisão que o painel pedia era "por
     * qual porta eu falo com o Fulano?" — a pergunta que ninguém responde sem
     * treino. Pessoas continua sendo a única porta para FALAR com alguém.
     *
     * O que mudou em 04/09/2026: Conversas passou a ser subtópico de
     * WhatsApp. Não desfaz a regra — ali não se escolhe com quem falar, se
     * confere o que a IA andou dizendo (é onde mora a revisão 👍/👎). O
     * defeito que isso conserta é outro: a tela de Conversas desenhava abas de
     * WhatsApp enquanto o menu acendia Pessoas, então o painel afirmava duas
     * seções ao mesmo tempo.
     */
    const itens = gruposVisiveis(false).flatMap((g) => g.itens);
    const pessoas = itens.find((i) => i.href === "/corretor/pessoas");
    expect(pessoas).toBeDefined();

    const subs = (pessoas?.subitens ?? []).map((s) => s.href);
    expect(subs).toContain("/corretor/leads");

    // Nenhuma das telas de carteira volta a ser DESTINO de menu.
    for (const href of ["/corretor/leads", "/corretor/funil", "/corretor/conversas"]) {
      expect(itens.some((i) => i.href === href)).toBe(false);
    }
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
    // Leads, funil e visitas são Pessoas: mesma cor, porque é a mesma carteira.
    expect(moduloAtivo("/corretor/leads")).toBe("leads");
    expect(moduloAtivo("/corretor/funil")).toBe("leads");
    expect(moduloAtivo("/corretor/visitas")).toBe("leads");
    // Conversas mudou de dono em 04/09: é o canal, não a carteira.
    expect(moduloAtivo("/corretor/conversas")).toBe("whatsapp");
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

  it("acende nos próprios subtópicos (lista, funil, visitas, adicionar)", () => {
    expect(itemAtivo("/corretor/leads", leads)).toBe(true);
    expect(itemAtivo("/corretor/funil", leads)).toBe(true);
    expect(itemAtivo("/corretor/visitas", leads)).toBe(true);
    expect(itemAtivo("/corretor/importar", leads)).toBe(true);
  });

  it("não acende em rota alheia", () => {
    expect(itemAtivo("/corretor/campanhas", leads)).toBe(false);
    expect(itemAtivo("/corretor/conversas", leads)).toBe(false);
    expect(itemAtivo(null, leads)).toBe(false);
  });
});


/**
 * Os subtópicos, e a regra que eles existem para sustentar.
 *
 * O painel tinha DUAS hierarquias que discordavam. `/corretor/campanhas` e
 * `/corretor/templates` eram absorvidos por Marketing no menu e desenhavam
 * abas de WhatsApp na tela; `/corretor/conversas` era Pessoas no menu e
 * também mostrava WhatsApp. O sidebar acendia uma seção e a barra de abas
 * dizia outra, na mesma tela. E `/corretor/links` não tinha item de menu NEM
 * aba — a única tela do painel sem pai nenhum.
 *
 * A causa era estrutural: cada barra de abas mantinha a própria lista,
 * escrita à mão, longe do mapa do menu. Estas guardas afirmam a correção —
 * uma fonte só — porque a regressão falha CALADA: tudo continua navegando,
 * só passa a mentir sobre onde a pessoa está.
 */
describe("subtópicos: uma hierarquia só", () => {
  const TOPICOS = GRUPOS_NAV.flatMap((g) => g.itens);

  it("o teto de sete conta TÓPICOS, não subtópicos", () => {
    // Se `gruposVisiveis` achatasse os subitens, o menu voltaria a ser a
    // lista de treze que a reforma desfez — só que sem ninguém perceber,
    // porque o número continuaria "passando" em outro lugar.
    const topicos = gruposVisiveis(true).flatMap((g) => g.itens);
    expect(topicos.length).toBeLessThanOrEqual(7);
    expect(topicos.some((i) => i.subitens && i.subitens.length > 0)).toBe(true);
  });

  it("nenhum subtópico é também um tópico", () => {
    const hrefsTopico = new Set(TOPICOS.map((i) => i.href));
    for (const t of TOPICOS) {
      for (const sub of t.subitens ?? []) {
        // A exceção legítima: o subtópico que É a tela de entrada da seção
        // (Minha IA em /corretor/whatsapp, Visão geral em /corretor/admin).
        if (sub.href === t.href) continue;
        expect(hrefsTopico.has(sub.href), `${sub.href} é tópico e subtópico`).toBe(false);
      }
    }
  });

  it("cada subtópico pertence a exatamente um tópico", () => {
    const donos = new Map<string, string[]>();
    for (const t of TOPICOS) {
      for (const sub of t.subitens ?? []) {
        donos.set(sub.href, [...(donos.get(sub.href) ?? []), t.href]);
      }
    }
    for (const [href, pais] of donos) {
      expect(pais, `${href} tem mais de um pai: ${pais.join(", ")}`).toHaveLength(1);
    }
  });

  it("toda rota tem UM dono, mesmo quando dois casam por prefixo", () => {
    // `/corretor/imoveis/criar-imagem` é subtópico de Marketing e casa por
    // prefixo com Imóveis. Sem desempate o menu acenderia os dois.
    expect(destinoAtivo("/corretor/imoveis/criar-imagem")?.href).toBe("/corretor/marketing");
    expect(destinoAtivo("/corretor/imoveis")?.href).toBe("/corretor/imoveis");
    expect(destinoAtivo("/corretor/imoveis/candidatos")?.href).toBe("/corretor/imoveis");
    expect(destinoAtivo("/corretor/conversas")?.href).toBe("/corretor/whatsapp");
    expect(destinoAtivo("/corretor/campanhas")?.href).toBe("/corretor/marketing");
  });

  it("`/corretor/links` tem um pai — era a única tela sem nenhum", () => {
    expect(destinoAtivo("/corretor/links")?.href).toBe("/corretor/marketing");
    expect(subitensDe("/corretor/marketing").map((s) => s.href)).toContain("/corretor/links");
  });

  it("a cor da tela concorda com o item aceso", () => {
    // O defeito original em uma linha: menu magenta, abas de WhatsApp.
    expect(moduloAtivo("/corretor/campanhas")).toBe("marketing");
    expect(moduloAtivo("/corretor/templates")).toBe("marketing");
    expect(moduloAtivo("/corretor/imoveis/criar-imagem")).toBe("marketing");
    expect(moduloAtivo("/corretor/marketing/video")).toBe("marketing");
    expect(moduloAtivo("/corretor/conversas")).toBe("whatsapp");
    expect(moduloAtivo("/corretor/imoveis/candidatos")).toBe("imoveis");
  });
});

describe("as barras de abas DERIVAM do menu", () => {
  /*
   * Esta é a guarda que impede a divergência voltar. Ela lê o código-fonte
   * porque o defeito não é de resultado, é de ORIGEM: uma barra de abas com
   * lista própria renderiza perfeitamente e só mente quando alguém muda o
   * menu e esquece dela — que foi exatamente o que aconteceu.
   */
  const fonte = (arq: string) =>
    readFileSync(join(process.cwd(), "src/app/corretor/(painel)/_componentes", arq), "utf8")
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  const BARRAS = ["AbasLeads.tsx", "AbasWhatsapp.tsx", "AbasMarketing.tsx", "AbasAdmin.tsx"];

  it.each(BARRAS)("%s monta as abas com subitensDe", (arq) => {
    expect(fonte(arq)).toMatch(/subitensDe\(/);
  });

  it.each(BARRAS)("%s não escreve rótulo de aba à mão", (arq) => {
    /*
     * O rótulo é o sinal exato de que a lista voltou a morar na barra. A
     * versão derivada nunca escreve um: ela faz `label: sub.label`, com o
     * texto vindo de `navegacao.tsx`. Uma lista escrita à mão sempre escreve
     * — foi assim que "Listas de transmissão" existiu em dois arquivos e as
     * duas hierarquias puderam discordar.
     *
     * Comparar ROTAS não serviria: as barras legitimamente citam uma ou duas
     * para decidir contador e pontinho.
     */
    const rotulos = fonte(arq).match(/\blabel:\s*"/g) ?? [];
    expect(rotulos.length, `${arq} escreve ${rotulos.length} rótulo(s) à mão`).toBe(0);
  });

  it("as abas de cada seção SÃO os subtópicos dela", () => {
    expect(subitensDe("/corretor/pessoas").map((s) => s.label)).toEqual([
      "Lista",
      "Funil",
      "Visitas",
      "Adicionar",
    ]);
    expect(subitensDe("/corretor/whatsapp").map((s) => s.href)).toEqual([
      "/corretor/conversas",
      "/corretor/whatsapp",
    ]);
    expect(subitensDe("/corretor/admin")).toHaveLength(6);
  });
});
