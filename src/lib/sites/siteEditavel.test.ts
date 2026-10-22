import { describe, expect, it } from "vitest";
import {
  contraste,
  ehCapaDoGrupo,
  formatoDaCapa,
  lerHostDigitado,
  LIMITES,
  normalizarCep,
  normalizarCor,
  normalizarInstagram,
  normalizarUrlHttps,
  normalizarWhatsapp,
  problemaDaCapa,
  TEXTO_CLARO,
  TEXTO_ESCURO,
  textoSobreACor,
  validarSiteDigitado,
  variaveisDaCor,
  type SiteDigitado,
} from "./siteEditavel";

const VAZIO: SiteDigitado = {
  cor: "",
  corSecundaria: "",
  corFundo: "",
  corTexto: "",
  corEscuro: "",
  corSecundariaEscuro: "",
  corFundoEscuro: "",
  corTextoEscuro: "",
  titulo: "",
  frase: "",
  sobre: "",
  whatsapp: "",
  email: "",
  logradouro: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  instagram: "",
  facebook: "",
};

describe("validarSiteDigitado", () => {
  it("tudo vazio é válido e não grava nada (o site cai no padrão)", () => {
    expect(validarSiteDigitado(VAZIO)).toEqual({
      ok: true,
      valor: { cor: null, corSecundaria: null, corFundo: null, corTexto: null, corEscuro: null, corSecundariaEscuro: null, corFundoEscuro: null, corTextoEscuro: null, titulo: null, frase: null, sobre: null, whatsapp: null, email: null, endereco: null, instagram: null, facebook: null },
    });
  });

  it("normaliza tudo para o formato do banco", () => {
    const r = validarSiteDigitado({
      cor: " #1F6F5C ",
      corSecundaria: "#0369A1",
      corFundo: "fff",
      corTexto: " #101a17",
      corEscuro: "D4A64B",
      corSecundariaEscuro: "",
      corFundoEscuro: "#0E1A10",
      corTextoEscuro: "#f3ebd6",
      titulo: "  Seu   próximo endereço ",
      frase: "Frase",
      sobre: "Primeira linha  \n\n\n\nSegunda",
      whatsapp: "(11) 99999-8888",
      email: " Contato@Sol.com.br ",
      logradouro: "Av. Brasil, 100",
      bairro: "Centro",
      cidade: "Barueri",
      uf: "sp",
      cep: "06404326",
      instagram: "@ImobSol",
      facebook: "www.facebook.com/imobsol",
    });
    expect(r).toEqual({
      ok: true,
      valor: {
        cor: "#1f6f5c",
        corSecundaria: "#0369a1",
        corFundo: "#ffffff",
        corTexto: "#101a17",
        corEscuro: "#d4a64b",
        corSecundariaEscuro: null,
        corFundoEscuro: "#0e1a10",
        corTextoEscuro: "#f3ebd6",
        titulo: "Seu próximo endereço",
        frase: "Frase",
        sobre: "Primeira linha\n\nSegunda",
        whatsapp: "5511999998888",
        email: "contato@sol.com.br",
        endereco: { logradouro: "Av. Brasil, 100", bairro: "Centro", cidade: "Barueri", uf: "SP", cep: "06404-326" },
        instagram: "https://www.instagram.com/imobsol/",
        facebook: "https://www.facebook.com/imobsol",
      },
    });
  });

  it("recusa cor, URL, e-mail e WhatsApp malformados, campo a campo", () => {
    const r = validarSiteDigitado({
      ...VAZIO,
      cor: "verde",
      email: "sem-arroba",
      whatsapp: "123",
      facebook: "javascript:alert(1)",
      instagram: "http://insecure.com/x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["cor", "email", "facebook", "instagram", "whatsapp"]);
  });

  it("recusa as três cores novas que não são hex, campo a campo", () => {
    const r = validarSiteDigitado({ ...VAZIO, corSecundaria: "azul", corFundo: "#12345", corTexto: "rgb(0,0,0)" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["corFundo", "corSecundaria", "corTexto"]);
  });

  it("recusa as quatro cores do escuro que não são hex, campo a campo", () => {
    const r = validarSiteDigitado({ ...VAZIO, corEscuro: "ouro", corSecundariaEscuro: "#12", corFundoEscuro: "url(x)", corTextoEscuro: "rgb(0,0,0)" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["corEscuro", "corFundoEscuro", "corSecundariaEscuro", "corTextoEscuro"]);
  });

  it("normaliza as cores do escuro; vazio vira nulo; formulário antigo sem os campos também", () => {
    const r = validarSiteDigitado({ ...VAZIO, corEscuro: "D4A64B", corFundoEscuro: "#0e1", corTextoEscuro: " " });
    expect(r.ok && r.valor).toMatchObject({ corEscuro: "#d4a64b", corSecundariaEscuro: null, corFundoEscuro: "#00ee11", corTextoEscuro: null });
    const { corEscuro: _a, corSecundariaEscuro: _b, corFundoEscuro: _c, corTextoEscuro: _d, ...antigo } = VAZIO;
    const sem = validarSiteDigitado(antigo as SiteDigitado);
    expect(sem.ok && sem.valor).toMatchObject({ corEscuro: null, corFundoEscuro: null });
  });

  it("respeita os limites de tamanho", () => {
    const r = validarSiteDigitado({
      ...VAZIO,
      titulo: "a".repeat(LIMITES.titulo + 1),
      frase: "a".repeat(LIMITES.frase + 1),
      sobre: "a".repeat(LIMITES.sobre + 1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["frase", "sobre", "titulo"]);
    expect(validarSiteDigitado({ ...VAZIO, sobre: "a".repeat(LIMITES.sobre) }).ok).toBe(true);
  });

  it("endereço é inteiro ou nada: meio endereço volta com o que falta", () => {
    const r = validarSiteDigitado({ ...VAZIO, logradouro: "Av. Brasil, 100", uf: "SAO", cep: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["bairro", "cep", "cidade", "uf"]);
  });
});

describe("normalizadores", () => {
  it("cor: hex de 3 ou 6 dígitos, com ou sem #", () => {
    expect(normalizarCor("#ABC")).toBe("#aabbcc");
    expect(normalizarCor("1f6f5c")).toBe("#1f6f5c");
    for (const ruim of ["", "#12", "#12345", "#gggggg", "rgb(1,2,3)", "#1f6f5c00"]) expect(normalizarCor(ruim), ruim).toBeNull();
  });

  it("URL: só https, sem credencial, com domínio", () => {
    expect(normalizarUrlHttps("https://x.com/a")).toBe("https://x.com/a");
    expect(normalizarUrlHttps("x.com.br")).toBe("https://x.com.br/");
    for (const ruim of ["http://x.com", "javascript:alert(1)", "data:text/html,a", "https://u:p@x.com", "https://localhost", "ftp://x.com"]) {
      expect(normalizarUrlHttps(ruim), ruim).toBeNull();
    }
    expect(normalizarUrlHttps(`https://x.com/${"a".repeat(300)}`)).toBeNull();
  });

  it("instagram aceita @usuario e o endereço", () => {
    expect(normalizarInstagram("@imob.sol")).toBe("https://www.instagram.com/imob.sol/");
    expect(normalizarInstagram("https://instagram.com/imobsol")).toBe("https://instagram.com/imobsol");
    expect(normalizarInstagram("@@")).toBeNull();
  });

  it("whatsapp vira E.164 brasileiro e o CEP ganha o hífen", () => {
    expect(normalizarWhatsapp("11 3333-4444")).toBe("551133334444");
    expect(normalizarWhatsapp("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(normalizarWhatsapp("999")).toBeNull();
    expect(normalizarCep("06404-326")).toBe("06404-326");
    expect(normalizarCep("0640")).toBeNull();
  });
});

describe("cor do site", () => {
  it("escolhe o texto de maior contraste e passa de 4,5:1 nas cores comuns", () => {
    expect(textoSobreACor("#ffffff")).toBe(TEXTO_ESCURO);
    expect(textoSobreACor("#000000")).toBe(TEXTO_CLARO);
    expect(textoSobreACor("#1f6f5c")).toBe(TEXTO_CLARO);
    expect(textoSobreACor("#ffd400")).toBe(TEXTO_ESCURO);
    for (const hex of ["#1f6f5c", "#0b3d91", "#ffd400", "#e63946", "#f4a261", "#6a4c93"]) {
      expect(contraste(hex, textoSobreACor(hex)), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("as variáveis reapontam só a família do acento e o texto sobre ele", () => {
    const v = variaveisDaCor("#1f6f5c");
    expect(v["--color-acento"]).toBe("#1f6f5c");
    expect(v["--color-sobre-cor"]).toBe(TEXTO_CLARO);
    expect(Object.keys(v).every((k) => k.startsWith("--color-acento") || k === "--color-sobre-cor")).toBe(true);
    expect(v["--color-acento-lavado"]).toBe("rgb(31 111 92 / 0.14)");
  });
});

describe("capa", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

  it("o formato vem dos bytes, e SVG, GIF e vazio são recusados", () => {
    expect(formatoDaCapa(png)?.extensao).toBe("png");
    expect(formatoDaCapa(jpg)?.extensao).toBe("jpg");
    expect(formatoDaCapa(webp)?.extensao).toBe("webp");
    expect(problemaDaCapa(new TextEncoder().encode("<svg onload=alert(1)>"))).toMatch(/Formato/);
    expect(problemaDaCapa(new TextEncoder().encode("GIF89a......"))).toMatch(/Formato/);
    expect(problemaDaCapa(new Uint8Array())).toMatch(/vazio/);
    expect(problemaDaCapa(png)).toBeNull();
  });

  it("passa de 5 MB é recusada", () => {
    const grande = new Uint8Array(5 * 1024 * 1024 + 1);
    grande.set(png);
    expect(problemaDaCapa(grande)).toMatch(/5 MB/);
  });

  it("só a capa do próprio grupo conta como capa antiga", () => {
    expect(ehCapaDoGrupo("g1", "grupos/g1/site/capa-0123456789abcdef.jpg")).toBe(true);
    expect(ehCapaDoGrupo("g1", "grupos/g2/site/capa-0123456789abcdef.jpg")).toBe(false);
    expect(ehCapaDoGrupo("g1", "grupos/g1/logo-0123456789abcdef.png")).toBe(false);
  });
});

describe("lerHostDigitado", () => {
  it("reduz a URL colada ao host em minúsculas", () => {
    expect(lerHostDigitado("https://WWW.ImobSol.com.br/")).toEqual({ ok: true, host: "www.imobsol.com.br" });
    expect(lerHostDigitado("imobsol.com.br/pagina?x=1")).toEqual({ ok: true, host: "imobsol.com.br" });
    expect(lerHostDigitado("imobsol.com.br.")).toEqual({ ok: true, host: "imobsol.com.br" });
  });

  it("recusa o que não é nome de DNS", () => {
    for (const ruim of ["", "  ", "localhost", "a b.com", "user@x.com", "x.com:8080", "-x.com", "x..com", "x_y.com", "*.x.com"]) {
      expect(lerHostDigitado(ruim).ok, ruim).toBe(false);
    }
  });
});
