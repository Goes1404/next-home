import { describe, expect, it } from "vitest";
import { montarFunilDoLink, proporcao, type BarradoLido, type CliqueLido } from "./funilDoLink";

const ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A127M; wv) AppleWebKit/537.36 Chrome/153 Mobile";
const ROBO = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function clique(id: string, extra: Partial<CliqueLido> = {}): CliqueLido {
  return {
    id,
    origem: "anuncio/dom-parque",
    created_at: "2026-10-05T12:00:00Z",
    user_agent: ANDROID,
    visitante: `v-${id}`,
    lead_id: null,
    ...extra,
  };
}

function barrado(extra: Partial<BarradoLido>): BarradoLido {
  return { dia: "2026-10-05", minutos_desde_clique: 3, clique_id: "c1", citou_imovel: false, ...extra };
}

describe("montarFunilDoLink", () => {
  it("tira o robô da Meta e conta pessoas pelo resumo, não cliques", () => {
    const f = montarFunilDoLink({
      cliques: [
        clique("c1", { visitante: "ana" }),
        clique("c2", { visitante: "ana" }),
        clique("c3", { visitante: "bia" }),
        clique("r1", { user_agent: ROBO, visitante: "robo" }),
      ],
      barrados: [],
      nomes: { "dom-parque": "Dom Parque" },
      dias: 7,
    });
    expect(f.total.cliques).toBe(3);
    expect(f.total.pessoas).toBe(2);
    expect(f.linhas[0].rotulo).toBe("Dom Parque");
  });

  it("pessoas fica nulo quando nenhum clique tem resumo (cliques antigos)", () => {
    const f = montarFunilDoLink({
      cliques: [clique("c1", { visitante: null })],
      barrados: [],
      nomes: {},
      dias: 7,
    });
    expect(f.linhas[0].pessoas).toBeNull();
  });

  it("quem escreveu sem a mensagem pronta conta na linha do clique, só dentro de 15 minutos", () => {
    const f = montarFunilDoLink({
      cliques: [clique("c1"), clique("c2")],
      barrados: [
        barrado({ clique_id: "c1", minutos_desde_clique: 2, citou_imovel: true }),
        barrado({ clique_id: "c2", minutos_desde_clique: 14 }),
        barrado({ clique_id: "c2", minutos_desde_clique: 40 }),
      ],
      nomes: {},
      dias: 7,
    });
    expect(f.total.escreveramSemAMensagem).toBe(2);
    expect(f.total.citaramOImovel).toBe(1);
  });

  it("mensagem sem clique por perto vira a linha de comparação, por dia", () => {
    const f = montarFunilDoLink({
      cliques: [clique("c1")],
      barrados: Array.from({ length: 14 }, () => barrado({ minutos_desde_clique: null, clique_id: null })),
      nomes: {},
      dias: 7,
    });
    expect(f.semCliquePorDia).toBe(2);
    expect(f.total.escreveramSemAMensagem).toBe(0);
  });

  it("todos os botões do site viram uma linha só, depois dos anúncios", () => {
    const f = montarFunilDoLink({
      cliques: [
        clique("s1", { origem: "site/nid-alphaville" }),
        clique("s2", { origem: "site" }),
        clique("a1"),
      ],
      barrados: [],
      nomes: {},
      dias: 7,
    });
    expect(f.linhas.map((l) => l.chave)).toEqual(["dom-parque", "site"]);
    expect(f.linhas[1].cliques).toBe(2);
  });

  it("conta lead pelo clique ligado a ele", () => {
    const f = montarFunilDoLink({
      cliques: [clique("c1", { lead_id: "L1" }), clique("c2")],
      barrados: [],
      nomes: {},
      dias: 7,
    });
    expect(f.total.leads).toBe(1);
  });
});

describe("clique classificado na hora (0174)", () => {
  it("o robô com navegador comum, marcado como não pessoa, sai da conta", () => {
    const f = montarFunilDoLink({
      cliques: [clique("c1"), clique("r1", { de_pessoa: false, origem: "site/dom-parque" })],
      barrados: [],
      nomes: { "dom-parque": "Dom Parque" },
      dias: 7,
    });
    expect(f.total.cliques).toBe(1);
  });

  it("clique antigo, sem classificação, segue pelo navegador", () => {
    const f = montarFunilDoLink({
      cliques: [clique("c1", { de_pessoa: null }), clique("r1", { de_pessoa: null, user_agent: ROBO })],
      barrados: [],
      nomes: {},
      dias: 7,
    });
    expect(f.total.cliques).toBe(1);
  });
});

describe("proporcao", () => {
  it("abaixo de 20 pessoas não vira porcentagem", () => {
    expect(proporcao(1, 10)).toBeNull();
    expect(proporcao(5, 400)).toBe("1,3%");
  });
});
