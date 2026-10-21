import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO,
  CORES_EM_BRANCO,
  TEMAS_PRONTOS,
  ajustarPrincipal,
  ajustarTexto,
  avisosDeContraste,
  cssDasCoresDoSite,
  escalaDaCor,
  fundoETextoEfetivos,
  limparCores,
  paraTextoBranco,
  variaveisDaPrevia,
  variaveisDoSite,
} from "./coresDoSite";
import { contraste, normalizarCor, textoSobreACor } from "./siteEditavel";

describe("temas prontos", () => {
  it("são de 4 a 6, com ids únicos e quatro cores hex válidas cada", () => {
    expect(TEMAS_PRONTOS.length).toBeGreaterThanOrEqual(4);
    expect(TEMAS_PRONTOS.length).toBeLessThanOrEqual(6);
    expect(new Set(TEMAS_PRONTOS.map((t) => t.id)).size).toBe(TEMAS_PRONTOS.length);
    for (const t of TEMAS_PRONTOS) {
      for (const cor of Object.values(t.cores)) expect(normalizarCor(cor)).toBe(cor);
    }
  });

  it("todos leem bem: texto sobre fundo e texto do botão sobre a principal passam de 4,5:1, sem aviso", () => {
    for (const t of TEMAS_PRONTOS) {
      expect(contraste(t.cores.texto, t.cores.fundo), t.nome).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(contraste(t.cores.principal, textoSobreACor(t.cores.principal)), t.nome).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO,
      );
      expect(avisosDeContraste({ ...t.cores }), t.nome).toEqual([]);
    }
  });
});

describe("contraste e ajuste automático", () => {
  it("avisa quando o texto não lê sobre o fundo, e o ajuste conserta", () => {
    const cores = { ...CORES_EM_BRANCO, texto: "#9aa5a1", fundo: "#ffffff" };
    const avisos = avisosDeContraste(cores);
    expect(avisos.map((a) => a.campo)).toEqual(["texto"]);
    expect(avisos[0].razao).toBeLessThan(CONTRASTE_MINIMO);
    const novo = ajustarTexto(cores.texto, cores.fundo);
    expect(contraste(novo, cores.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(avisosDeContraste({ ...cores, texto: novo })).toEqual([]);
  });

  it("ajusta o texto também em fundo escuro (clareia em vez de escurecer)", () => {
    const novo = ajustarTexto("#445544", "#101010");
    expect(contraste(novo, "#101010")).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(novo > "#445544").toBe(true);
  });

  it("não mexe no que já lê bem", () => {
    expect(ajustarTexto("#111111", "#ffffff")).toBe("#111111");
    expect(ajustarPrincipal("#1d4ed8")).toBe("#1d4ed8");
  });

  it("o texto do botão sobre a principal lê bem em qualquer cor (o texto é automático): nunca há aviso", () => {
    for (const principal of ["#2f9e6d", "#808080", "#767676", "#ffd600", "#000000", "#ffffff", "#e91e63"]) {
      expect(contraste(principal, textoSobreACor(principal)), principal).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(avisosDeContraste({ ...CORES_EM_BRANCO, principal }), principal).toEqual([]);
      expect(ajustarPrincipal(principal), principal).toBe(principal);
    }
  });

  it("a escala brand aguenta o texto branco fixo dos botões antigos, mesmo com cor clara", () => {
    for (const principal of ["#ffd600", "#2f9e6d", "#ffffff", "#1d4ed8"]) {
      const v = variaveisDoSite({ principal });
      expect(contraste(v["--color-brand-500"], "#ffffff"), principal).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(v["--color-acento"]).toBe(principal);
    }
    expect(paraTextoBranco("#1d4ed8")).toBe("#1d4ed8");
  });

  it("sem fundo escolhido não há o que comparar com o texto", () => {
    expect(avisosDeContraste({ ...CORES_EM_BRANCO, texto: "#999999" })).toEqual([]);
  });
});

describe("fundo e texto efetivos", () => {
  it("nada escolhido: nulo (o site segue o tema)", () => {
    expect(fundoETextoEfetivos(CORES_EM_BRANCO)).toBeNull();
  });
  it("só o fundo: o texto sai com contraste", () => {
    for (const fundo of ["#ffffff", "#101820", "#cfd9c2"]) {
      const e = fundoETextoEfetivos({ ...CORES_EM_BRANCO, fundo })!;
      expect(contraste(e.texto, e.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });
  it("só o texto: o fundo sai com contraste", () => {
    for (const texto of ["#111111", "#f5f5f5", "#1d4ed8"]) {
      const e = fundoETextoEfetivos({ ...CORES_EM_BRANCO, texto })!;
      expect(contraste(e.texto, e.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });
});

describe("variáveis CSS do site", () => {
  it("sem cor nenhuma não há nada a injetar", () => {
    expect(variaveisDoSite(CORES_EM_BRANCO)).toEqual({});
    expect(cssDasCoresDoSite(CORES_EM_BRANCO)).toBeNull();
  });

  it("só a principal: acento e escala brand, sem tocar em fundo e texto (o tema segue valendo)", () => {
    const v = variaveisDoSite({ principal: "#1f6f5c" });
    expect(v["--color-acento"]).toBe("#1f6f5c");
    expect(v["--color-brand-500"]).toBe(paraTextoBranco("#1f6f5c"));
    expect(Object.keys(v).some((k) => k.startsWith("--color-brand-"))).toBe(true);
    expect(v["--color-fundo"]).toBeUndefined();
    expect(v["--color-titulo"]).toBeUndefined();
    const css = cssDasCoresDoSite({ principal: "#1f6f5c" })!;
    expect(css).not.toContain("color-scheme");
    expect(css).not.toContain("radiogroup");
  });

  it("a escala parte da cor no degrau 500, mais clara abaixo e mais escura acima", () => {
    const e = escalaDaCor("#336699");
    expect(e[500]).toBe("#336699");
    expect(contraste(e[50], "#ffffff")).toBeLessThan(contraste(e[300], "#ffffff"));
    expect(contraste(e[900], "#ffffff")).toBeGreaterThan(contraste(e[600], "#ffffff"));
  });

  it("a secundária reaponta o realce e a escala azure", () => {
    const v = variaveisDoSite({ secundaria: "#0369a1" });
    expect(v["--color-realce"]).toBe("#0369a1");
    expect(v["--color-azure-500"]).toBe("#0369a1");
    expect(v["--color-realce-lavado"]).toBe("rgb(3 105 161 / 0.14)");
  });

  it("fundo e texto trocam os papéis de superfície e de texto, e o texto de apoio lê sobre o fundo", () => {
    for (const t of TEMAS_PRONTOS) {
      const v = variaveisDoSite({ fundo: t.cores.fundo, texto: t.cores.texto });
      expect(v["--color-fundo"]).toBe(t.cores.fundo);
      expect(v["--color-titulo"]).toBe(t.cores.texto);
      expect(contraste(v["--color-apoio"], t.cores.fundo), t.nome).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });

  it("com fundo escolhido, o texto de acento é puxado até ler sobre ele (cor escura em fundo escuro)", () => {
    const v = variaveisDoSite({ principal: "#0b2a5b", fundo: "#101820", texto: "#f2f2f0" });
    expect(v["--color-acento"]).toBe("#0b2a5b");
    expect(contraste(v["--color-acento-suave"], "#101820")).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
  });

  it("fundo e texto fixam o esquema e escondem o seletor de tema", () => {
    expect(cssDasCoresDoSite({ fundo: "#ffffff" })).toContain("color-scheme:light");
    expect(cssDasCoresDoSite({ fundo: "#101010" })).toContain("color-scheme:dark");
    expect(cssDasCoresDoSite({ fundo: "#ffffff" })).toContain('[role="radiogroup"][aria-label="Tema"]{display:none}');
  });

  it("só hex chega ao CSS: o que não for cor é descartado", () => {
    const sujo = { principal: "red;}</style><script>x</script>", fundo: "url(x)", texto: "#12345", secundaria: "#ABCDEF" };
    expect(limparCores(sujo)).toEqual({ principal: null, fundo: null, texto: null, secundaria: null });
    expect(cssDasCoresDoSite(sujo)).toBeNull();
    const css = cssDasCoresDoSite({ principal: "#1f6f5c" })!;
    expect(css).toMatch(/^:root\{[^<>{}]*\}$/);
  });

  it("a prévia preenche o que faltou com um fundo e um texto padrão que leem bem", () => {
    const v = variaveisDaPrevia({ principal: "#1d4ed8" });
    expect(contraste(v["--color-titulo"], v["--color-fundo"])).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(v["--color-acento"]).toBe("#1d4ed8");
  });
});
