import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REGRAS_DE_PLANO,
  expressaoDeCamera,
  movimentoDoPlano,
  regraDoTipo,
  tipoDoPlano,
} from "./gramatica";
import { duracaoTotal, legendaDoPlano, montarRoteiro, ritmoDoObjetivo } from "./roteiro";
import type { Midia } from "@/lib/types";

const foto = (alt: string, url = `https://x/${alt.slice(0, 8)}.jpg`): Midia => ({
  tipo: "foto",
  url,
  alt,
  largura: 1000,
  altura: 512,
  blurDataUrl: null,
});

describe("tipoDoPlano — a leitura do alt", () => {
  it("reconhece os quatro tipos com alt real do catálogo", () => {
    expect(tipoDoPlano("Fachada das torres ao pôr do sol entre árvores")).toBe("fachada");
    expect(tipoDoPlano("Living integrado com cozinha gourmet e varanda")).toBe("interior");
    expect(tipoDoPlano("Pet place gramado com túnel e obstáculos para cães")).toBe("lazer");
    expect(tipoDoPlano("Planta de implantação do condomínio com torres e quadra")).toBe(
      "implantacao",
    );
  });

  it("'gourmet' sozinho não faz de um living uma área de lazer", () => {
    // Trava que o teste pegou na primeira rodada. "Cozinha gourmet" é o
    // interior do apartamento; "Espaço gourmet" é a área comum. Sem a palavra
    // que especifica, o living ganharia PAN onde devia ganhar PUSH — e é a
    // mesma armadilha que `lazerFotos.ts` já tinha documentado.
    expect(tipoDoPlano("Living integrado com cozinha gourmet e varanda")).toBe("interior");
    // Ambiguidade tolerada: "churrasqueira" puxa para lazer mesmo numa varanda
    // da unidade. O custo é um PAN onde caberia um PUSH — e percorrer uma
    // varanda lateralmente é um plano bom do mesmo jeito.
    expect(tipoDoPlano("Varanda gourmet com churrasqueira da unidade")).toBe("lazer");
    expect(tipoDoPlano("Espaço gourmet com ilha, cooktop e mesas")).toBe("lazer");
    expect(tipoDoPlano("Salão de festas com ilha gourmet junto ao jardim")).toBe("lazer");
  });

  it("implantação vence fachada quando o alt tem os dois", () => {
    // "Planta de implantação do condomínio com TORRES" casaria em fachada
    // também. Ali o movimento certo é o que revela o conjunto, não o que sobe.
    expect(tipoDoPlano("Vista aérea do condomínio com as torres e a piscina")).toBe("implantacao");
  });

  it("cai em interior quando não reconhece — o movimento que menos estraga", () => {
    // Errar para o genérico custa uma tomada morna; errar para TILT numa foto
    // de sofá sobe a câmera pelo teto.
    for (const alt of ["", "   ", "Foto do empreendimento", null, undefined]) {
      expect(tipoDoPlano(alt)).toBe("interior");
      expect(movimentoDoPlano(alt)).toBe("push");
    }
  });

  it("toda regra tem um movimento e uma ajuda que descreve o efeito", () => {
    for (const r of REGRAS_DE_PLANO) {
      expect(regraDoTipo(r.tipo).movimento, r.tipo).toBe(r.movimento);
      expect(r.ajuda.length, r.tipo).toBeGreaterThan(20);
    }
  });
});

describe("expressaoDeCamera — a matemática do movimento", () => {
  it("toda expressão usa aceleração, nunca movimento linear", () => {
    // Movimento linear é o que denuncia slideshow. Se alguém "simplificar" uma
    // dessas tirando o pow(), o vídeo volta a parecer apresentação de slides —
    // e isso passa por build, tipo e teste de dimensão sem reclamar.
    for (const m of ["tilt", "push", "pan", "pull"] as const) {
      const e = expressaoDeCamera(m, 120);
      const tudo = `${e.z} ${e.x} ${e.y}`;
      expect(tudo, m).toContain("pow(1-on/120,3)");
    }
  });

  it("usa `on`, que é a variável que o zoompan expõe — `n` não existe nele", () => {
    const e = expressaoDeCamera("push", 90);
    expect(`${e.z}${e.x}${e.y}`).not.toMatch(/\bn\/90\b/);
    expect(e.z).toContain("on/90");
  });

  it("tilt precisa de zoom alto: sem folga vertical a câmera não sobe", () => {
    const e = expressaoDeCamera("tilt", 120);
    // O zoom do tilt começa acima de 1.3; se cair para perto de 1.0 não sobra
    // pixel nenhum para percorrer e o movimento some sem erro nenhum.
    expect(Number(e.z.slice(0, 4))).toBeGreaterThan(1.3);
    expect(e.y).toContain("ih-ih/zoom");
  });

  it("pan trava o zoom e atravessa lateralmente", () => {
    const e = expressaoDeCamera("pan", 120);
    expect(e.z).toBe("1.22");
    expect(e.x).toContain("iw-iw/zoom");
  });

  it("push aproxima e pull afasta — as direções são opostas", () => {
    // No primeiro quadro (on=0) o pow vale 1; no último (on=n) vale 0.
    const push = expressaoDeCamera("push", 100).z; // 1.18-0.18*1 = 1.00 → 1.18
    const pull = expressaoDeCamera("pull", 100).z; // 1.02+0.24*1 = 1.26 → 1.02
    expect(push.startsWith("1.18-")).toBe(true);
    expect(pull.startsWith("1.02+")).toBe(true);
  });

  it("recusa contagem de quadros inválida em vez de gerar expressão quebrada", () => {
    for (const q of [0, -5, NaN, Infinity]) {
      expect(() => expressaoDeCamera("push", q)).toThrow(/quadros/);
    }
  });
});

describe("montarRoteiro", () => {
  const catalogo = [
    foto("Fachada das torres ao pôr do sol"),
    foto("Living integrado com varanda"),
    foto("Piscina coberta com deck"),
    foto("Sala de jantar integrada à cozinha"),
    foto("Academia equipada com esteiras"),
    foto("Planta de implantação do condomínio"),
  ];

  it("abre pelo plano que o objetivo pede", () => {
    expect(montarRoteiro({ fotos: catalogo, objetivo: "lancamento" })[0].tipo).toBe("fachada");
    expect(montarRoteiro({ fotos: catalogo, objetivo: "decorado" })[0].tipo).toBe("interior");
    expect(montarRoteiro({ fotos: catalogo, objetivo: "vida_no_bairro" })[0].tipo).toBe("lazer");
  });

  it("alterna tipos: três interiores seguidos parecem a mesma sala", () => {
    const muitosInteriores = [
      foto("Living integrado"),
      foto("Sala de jantar"),
      foto("Cozinha gourmet"),
      foto("Fachada das torres"),
      foto("Piscina coberta"),
    ];
    const tipos = montarRoteiro({ fotos: muitosInteriores, objetivo: "decorado" }).map((p) => p.tipo);
    // Nenhum tipo aparece três vezes seguidas.
    for (let i = 0; i + 2 < tipos.length; i++) {
      expect(new Set(tipos.slice(i, i + 3)).size, tipos.join(",")).toBeGreaterThan(1);
    }
  });

  it("não descarta foto por repetir tipo — imóvel só com interior tem vídeo", () => {
    const so = [foto("Living A"), foto("Sala B"), foto("Cozinha C"), foto("Quarto D")];
    const r = montarRoteiro({ fotos: so, objetivo: "decorado" });
    expect(r.length).toBe(4);
    expect(new Set(r.map((p) => p.foto.url)).size).toBe(4);
  });

  it("ignora mídia sem url e devolve vazio quando não sobra nada", () => {
    expect(montarRoteiro({ fotos: [], objetivo: "lancamento" })).toEqual([]);
    const semUrl = [{ ...foto("Fachada"), url: "" }];
    expect(montarRoteiro({ fotos: semUrl, objetivo: "lancamento" })).toEqual([]);
  });

  it("nunca repete a mesma foto no roteiro", () => {
    const r = montarRoteiro({ fotos: catalogo, objetivo: "ultimas_unidades" });
    expect(new Set(r.map((p) => p.foto.url)).size).toBe(r.length);
  });

  it("o ritmo de urgência corta mais rápido que o de contemplação", () => {
    expect(ritmoDoObjetivo("ultimas_unidades").duracaoPorPlano).toBeLessThan(
      ritmoDoObjetivo("decorado").duracaoPorPlano,
    );
  });
});

describe("duracaoTotal", () => {
  it("desconta o crossfade — os planos se sobrepõem", () => {
    const planos = montarRoteiro({
      fotos: [foto("Fachada"), foto("Living"), foto("Piscina")],
      objetivo: "lancamento",
    });
    // 3 planos de 4 s com 2 transições de 0,7 = 12 - 1,4 = 10,6
    expect(duracaoTotal(planos, 0.7)).toBe(10.6);
  });

  it("cai na faixa que converte em Reels (15 a 25 s) nos objetivos principais", () => {
    const fotos = Array.from({ length: 8 }, (_, i) =>
      foto(["Fachada das torres", "Living integrado", "Piscina coberta", "Sala de jantar"][i % 4] + ` ${i}`),
    );
    for (const objetivo of ["lancamento", "decorado", "ultimas_unidades"] as const) {
      const total = duracaoTotal(montarRoteiro({ fotos, objetivo }));
      expect(total, objetivo).toBeGreaterThanOrEqual(11);
      expect(total, objetivo).toBeLessThanOrEqual(25);
    }
  });

  it("roteiro vazio tem duração zero, não NaN", () => {
    expect(duracaoTotal([])).toBe(0);
  });
});

describe("legendaDoPlano", () => {
  it("corta na primeira pontuação: alt é texto de leitor de tela, não de cliente", () => {
    expect(legendaDoPlano("Living integrado com adega climatizada, unidade 03")).toBe(
      "Living integrado com adega climatizada",
    );
  });

  it("trunca com reticências o que não cabe", () => {
    const longo = legendaDoPlano("Academia equipada com esteiras bicicletas e estações completas");
    expect(longo.length).toBeLessThanOrEqual(42);
    expect(longo.endsWith("…")).toBe(true);
  });

  it("alt vazio vira legenda vazia, nunca 'undefined' na tela", () => {
    for (const alt of ["", null, undefined, "   "]) expect(legendaDoPlano(alt)).toBe("");
  });
});

/*
 * Guarda de código-fonte, na classe de `gravacaoDeMensagem.test.ts` e
 * `escalaDoPainel.test.ts`. A regressão que ela pega falha CALADA: o vídeo
 * continua saindo, com o tamanho certo e sem erro nenhum — só volta a parecer
 * apresentação de slides, ou a decidir por sorteio o que devia sair do dado.
 */
describe("as guardas do motor", () => {
  const fonte = (arquivo: string) =>
    readFileSync(join(process.cwd(), "src/lib/video", arquivo), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("a gramática não sorteia nada — a variação sai do dado", () => {
    const tudo = fonte("gramatica.ts") + fonte("roteiro.ts");
    expect(tudo).not.toMatch(/Math\.random|shuffle|sample\(/);
  });

  it("os módulos de decisão continuam PUROS — sem server-only, sem sharp, sem ffmpeg", () => {
    // Constante ou tipo importado de módulo com dependência nativa arrasta o
    // binário para o grafo do cliente e derruba a tela inteira. Já aconteceu
    // com o `sharp` no editor de imóveis.
    for (const arquivo of ["gramatica.ts", "roteiro.ts"]) {
      const f = fonte(arquivo);
      expect(f, arquivo).not.toMatch(/server-only|from "sharp"|child_process|fluent-ffmpeg/);
    }
  });
});
