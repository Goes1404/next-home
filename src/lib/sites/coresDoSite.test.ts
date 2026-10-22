import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO,
  CORES_EM_BRANCO,
  TEMAS_ESCUROS_PRONTOS,
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
  variaveisDaPreviaEscura,
  variaveisDoSite,
} from "./coresDoSite";
import { contraste, luminancia, normalizarCor, textoSobreACor } from "./siteEditavel";

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

// ── Modo escuro (0212) ────────────────────────────────────────────────────

const ESCURO_AMBAR = { principal: "#d4a64b", secundaria: "#e8c77e", fundo: "#0e1a10", texto: "#f3ebd6" };
const CLARO_PADRAO = { principal: "#1d4ed8", secundaria: "#0369a1", fundo: "#f3f7fd", texto: "#0f1f3d" };

describe("modo escuro: aplicação", () => {
  it("sem cor do escuro: a saída é a de hoje, byte a byte (com escuro ausente, nulo, vazio ou inválido)", () => {
    for (const c of [{ principal: "#1f6f5c" }, CLARO_PADRAO, { fundo: "#101010" }]) {
      const hoje = cssDasCoresDoSite(c);
      expect(cssDasCoresDoSite({ ...c, escuro: null })).toBe(hoje);
      expect(cssDasCoresDoSite({ ...c, escuro: CORES_EM_BRANCO })).toBe(hoje);
      expect(cssDasCoresDoSite({ ...c, escuro: { principal: "javascript:1" } })).toBe(hoje);
    }
    expect(cssDasCoresDoSite({ escuro: CORES_EM_BRANCO })).toBeNull();
  });

  it("só o escuro (claro vazio): sem bloco do claro, o seletor fica e só o tema escuro leva as cores", () => {
    const css = cssDasCoresDoSite({ escuro: ESCURO_AMBAR })!;
    expect(css).toMatch(/^:root\[data-tema="escuro"\]\{color-scheme:dark;/);
    expect(css).not.toContain("radiogroup");
    expect(css).toContain("--color-acento:#d4a64b");
    expect(css).toContain("--color-fundo:#0e1a10");
    expect(css).toContain("--color-titulo:#f3ebd6");
    expect(css.match(/:root/g)).toHaveLength(1);
  });

  it("claro com principal e escuro com fundo/texto: o claro fica como hoje (sem papéis) e o seletor continua", () => {
    const css = cssDasCoresDoSite({ principal: "#1f6f5c", escuro: { fundo: "#0e1a10", texto: "#f3ebd6" } })!;
    const hoje = cssDasCoresDoSite({ principal: "#1f6f5c" })!;
    expect(css.startsWith(hoje.replace(":root{", ':root:not([data-tema="escuro"]){'))).toBe(true);
    expect(css).not.toContain("radiogroup");
    const escuro = css.slice(css.indexOf(':root[data-tema="escuro"]'));
    expect(escuro).toContain("--color-acento:#1f6f5c");
    expect(escuro).toContain("--color-fundo:#0e1a10");
  });

  it("claro e escuro completos: cada tema com as suas, e o seletor aparece", () => {
    const css = cssDasCoresDoSite({ ...CLARO_PADRAO, escuro: ESCURO_AMBAR })!;
    const [claro, escuro] = css.split(':root[data-tema="escuro"]');
    expect(claro).toMatch(/^:root:not\(\[data-tema="escuro"\]\)\{color-scheme:light;/);
    expect(claro).toContain("--color-fundo:#f3f7fd");
    expect(claro).not.toContain("#0e1a10");
    expect(escuro).toContain("--color-fundo:#0e1a10");
    expect(escuro).not.toContain("#f3f7fd");
    expect(css).not.toContain("radiogroup");
  });

  it("fundo/texto do claro sem fundo/texto do escuro: o escuro não herda as superfícies do claro", () => {
    const css = cssDasCoresDoSite({ ...CLARO_PADRAO, escuro: { principal: "#d4a64b" } })!;
    const corte = css.indexOf(':root[data-tema="escuro"]');
    const escuro = css.slice(corte);
    expect(escuro).toContain("--color-acento:#d4a64b");
    expect(escuro).not.toContain("--color-fundo");
    expect(escuro).toContain("color-scheme:dark");
    expect(css.indexOf("--color-fundo:#f3f7fd")).toBeLessThan(corte);
    expect(css.slice(0, corte)).toContain(':root:not([data-tema="escuro"])');
  });

  it("o contraste do escuro é ajustado sobre o fundo do escuro, como no claro", () => {
    const e = { principal: "#0b2a5b", fundo: "#101820", texto: "#f3ebd6" };
    const v = variaveisDoSite(e);
    const css = cssDasCoresDoSite({ escuro: e })!;
    expect(css).toContain(`--color-acento-suave:${v["--color-acento-suave"]}`);
    expect(contraste(v["--color-acento-suave"], "#101820")).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
  });

  it("só hex chega ao CSS do escuro", () => {
    const css = cssDasCoresDoSite({ escuro: { principal: "red;}</style><script>", fundo: "#0e1a10", texto: "#F3EBD6" } })!;
    expect(css).not.toMatch(/[<>]/);
    expect(css).not.toContain("F3EBD6");
  });

  it("o tema pronto Verde e dourado tem hex válido e lê bem", () => {
    expect(TEMAS_ESCUROS_PRONTOS.map((t) => t.id)).toContain("verde-e-dourado");
    for (const t of TEMAS_ESCUROS_PRONTOS) {
      for (const cor of Object.values(t.cores)) expect(normalizarCor(cor)).toBe(cor);
      expect(avisosDeContraste(t.cores)).toEqual([]);
      expect(contraste(t.cores.texto, t.cores.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(contraste(t.cores.principal, t.cores.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(contraste(t.cores.secundaria, t.cores.fundo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });

  it("avisa contraste fraco no escuro e o ajuste conserta", () => {
    const fraco = { ...CORES_EM_BRANCO, fundo: "#0e1a10", texto: "#2a3a2c" };
    expect(avisosDeContraste(fraco).map((a) => a.campo)).toContain("texto");
    expect(contraste(ajustarTexto("#2a3a2c", "#0e1a10"), "#0e1a10")).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
  });

  it("a prévia do escuro usa o cálculo do site, com o escuro padrão no que faltou e a marca do claro", () => {
    const v = variaveisDaPreviaEscura({ principal: "#1f6f5c" }, { texto: "#f3ebd6" });
    expect(v["--color-acento"]).toBe("#1f6f5c");
    expect(contraste(v["--color-titulo"], v["--color-fundo"])).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    expect(luminancia(v["--color-fundo"])).toBeLessThan(0.1);
    expect(variaveisDaPreviaEscura({}, ESCURO_AMBAR)["--color-fundo"]).toBe("#0e1a10");
  });
});
