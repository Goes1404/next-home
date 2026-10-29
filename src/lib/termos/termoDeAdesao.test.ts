import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { contaAceitouTermoDeAdesao, hashDoIp, navegadorDoAceite, segredoDoAceite } from "./aceiteDoTermoDeAdesao";
import {
  CAMINHO_DO_TERMO_DE_ADESAO,
  precisaAceitarTermoDeAdesao,
  SECOES_DO_TERMO_DE_ADESAO,
  TERMO_DE_ADESAO_E_RASCUNHO,
  VERSAO_DO_TERMO_DE_ADESAO,
} from "./termoDeAdesao";

/**
 * O termo de adesão da conta (0247, 29/10/2026): o texto (rascunho para o
 * advogado, neutro de ramo), quem é parado no painel (só o gestor, uma vez
 * por versão e por conta) e o que fica gravado (hash do IP, nunca o IP).
 */

const tudo = SECOES_DO_TERMO_DE_ADESAO.flatMap((s) => [s.titulo, ...s.paragrafos]).join(" ");

describe("o texto do termo de adesão", () => {
  it("é rascunho para o advogado, e a versão diz isso", () => {
    expect(TERMO_DE_ADESAO_E_RASCUNHO).toBe(true);
    expect(VERSAO_DO_TERMO_DE_ADESAO).toMatch(/rascunho/);
    expect(VERSAO_DO_TERMO_DE_ADESAO.length).toBeLessThanOrEqual(60);
  });

  it("fala de plano, mensalidade, LGPD, cancelamento e do risco do WhatsApp", () => {
    expect(tudo).toMatch(/plano/i);
    expect(tudo).toMatch(/mensalidade/i);
    expect(tudo).toMatch(/LGPD/);
    expect(tudo).toMatch(/operadora/);
    expect(tudo).toMatch(/cancel/i);
    expect(tudo).toMatch(/90 dias/);
    expect(tudo).toMatch(/bloque/i);
    expect(tudo).toMatch(/pode errar/i);
  });

  it("serve a qualquer ramo: nada supõe imóvel nem imobiliária", () => {
    expect(tudo.toLowerCase()).not.toMatch(/imóve|imobili|corretor|creci/);
  });

  it("não promete o que o produto não faz", () => {
    const minusculo = tudo.toLowerCase();
    for (const promessa of ["garantimos que", "nunca será bloqueado", "100%", "sem risco", "api oficial do whatsapp"]) {
      expect(minusculo).not.toContain(promessa);
    }
  });
});

describe("quem o painel para", () => {
  it("só o gestor cuja conta ainda não aceitou a versão vigente", () => {
    expect(precisaAceitarTermoDeAdesao({ papel: "gestor", ehContaDaCasa: false, contaJaAceitou: false })).toBe(true);
    expect(precisaAceitarTermoDeAdesao({ papel: "gestor", ehContaDaCasa: false, contaJaAceitou: true })).toBe(false);
  });

  it("corretor nunca é parado, aceite ou não", () => {
    expect(precisaAceitarTermoDeAdesao({ papel: "corretor", ehContaDaCasa: false, contaJaAceitou: false })).toBe(false);
  });

  it("a conta da casa fica de fora", () => {
    expect(precisaAceitarTermoDeAdesao({ papel: "gestor", ehContaDaCasa: true, contaJaAceitou: false })).toBe(false);
  });
});

describe("contaAceitouTermoDeAdesao", () => {
  function cliente(linhas: { grupo_id: string; versao: string }[], erro: { message: string } | null = null) {
    const filtros: [string, unknown][] = [];
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn((c: string, v: unknown) => {
        filtros.push([c, v]);
        return consulta;
      }),
      limit: vi.fn(() => consulta),
      maybeSingle: vi.fn(async () => {
        if (erro) return { data: null, error: erro };
        const achada = linhas.find((l) => filtros.every(([c, v]) => (l as Record<string, unknown>)[c] === v));
        return { data: achada ?? null, error: null };
      }),
    };
    return { from: vi.fn(() => consulta), filtros };
  }

  it("procura o aceite da CONTA na versão vigente", async () => {
    const c = cliente([{ grupo_id: "g1", versao: VERSAO_DO_TERMO_DE_ADESAO }]);
    expect(await contaAceitouTermoDeAdesao(c as never, "g1")).toBe(true);
    expect(c.from).toHaveBeenCalledWith("aceites_do_termo_de_adesao");
    expect(c.filtros).toEqual([
      ["grupo_id", "g1"],
      ["versao", VERSAO_DO_TERMO_DE_ADESAO],
    ]);
  });

  it("versão nova do texto: o aceite da antiga não vale, e o gestor aceita de novo", async () => {
    const c = cliente([{ grupo_id: "g1", versao: "2026-01-01-antiga" }]);
    expect(await contaAceitouTermoDeAdesao(c as never, "g1")).toBe(false);
    expect(precisaAceitarTermoDeAdesao({ papel: "gestor", ehContaDaCasa: false, contaJaAceitou: false })).toBe(true);
  });

  it("o aceite de outra conta não vale para esta", async () => {
    const c = cliente([{ grupo_id: "g2", versao: VERSAO_DO_TERMO_DE_ADESAO }]);
    expect(await contaAceitouTermoDeAdesao(c as never, "g1")).toBe(false);
  });

  it("erro de leitura não tranca o painel (a tabela pode chegar depois do deploy)", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await contaAceitouTermoDeAdesao(cliente([], { message: "relation does not exist" }) as never, "g1")).toBe(true);
    espiao.mockRestore();
  });
});

describe("o que fica gravado do aceite", () => {
  it("o IP vira HMAC (64 hex, o formato do CHECK), nunca o IP; sem segredo ou sem IP, nada", () => {
    const h = hashDoIp("200.1.2.3", "segredo");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("200.1.2.3");
    expect(hashDoIp("200.1.2.3", "segredo")).toBe(h);
    expect(hashDoIp("200.1.2.4", "segredo")).not.toBe(h);
    expect(hashDoIp("200.1.2.3", "outro")).not.toBe(h);
    expect(hashDoIp(null, "segredo")).toBeNull();
    expect(hashDoIp("200.1.2.3", null)).toBeNull();
  });

  it("o segredo é o próprio do aceite, ou a chave de serviço", () => {
    expect(segredoDoAceite({ SEGREDO_DO_ACEITE: "a", SUPABASE_SECRET_KEY: "b" })).toBe("a");
    expect(segredoDoAceite({ SUPABASE_SECRET_KEY: "b" })).toBe("b");
    expect(segredoDoAceite({})).toBeNull();
  });

  it("o navegador é cortado no limite do CHECK (500)", () => {
    expect(navegadorDoAceite("x".repeat(900))).toHaveLength(500);
    expect(navegadorDoAceite("  ")).toBeNull();
  });
});

describe("o termo no painel (lendo o código)", () => {
  const raiz = join(process.cwd(), "src", "app", "corretor");
  const semComentarios = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const ler = (...partes: string[]) => semComentarios(readFileSync(join(raiz, ...partes), "utf8"));

  it("o layout manda só o GESTOR para o termo, e só pelo termo de adesão", () => {
    const layout = ler("(painel)", "layout.tsx");
    const bloco = layout.slice(layout.indexOf("contaAceitouTermoDeAdesao(") - 200, layout.indexOf("redirect(CAMINHO_DO_TERMO_DE_ADESAO)") + 40);
    expect(bloco).toMatch(/corretor\.papel === "gestor"/);
    expect(bloco).toMatch(/GRUPO_NEXT_HOME_ID/);
    expect(layout).toMatch(/precisaAceitarTermoDeAdesao\(/);
    expect(CAMINHO_DO_TERMO_DE_ADESAO).toBe("/corretor/termo-de-adesao");
  });

  it("a página do termo mora fora do (painel), tem Sair e imprime", () => {
    expect(existsSync(join(raiz, "termo-de-adesao", "page.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "(painel)", "termo-de-adesao"))).toBe(false);
    const pagina = ler("termo-de-adesao", "page.tsx");
    expect(pagina).toMatch(/action=\{sair\}/);
    expect(pagina).toMatch(/BotaoImprimir/);
    expect(ler("termo-de-adesao", "FormularioAceiteDoTermo.tsx")).toMatch(/window\.print\(\)/);
  });

  it("a action confere o gestor antes de gravar e grava pela chave só depois da sessão", () => {
    const acoes = ler("termo-de-adesao", "acoes.ts");
    const sessao = acoes.indexOf("getCorretorLogado()");
    const papel = acoes.indexOf('corretor.papel !== "gestor"');
    const chave = acoes.indexOf("createServiceClient()");
    expect(sessao).toBeGreaterThan(-1);
    expect(papel).toBeGreaterThan(sessao);
    expect(chave).toBeGreaterThan(papel);
    expect(acoes).toMatch(/from\("aceites_do_termo_de_adesao"\)[\s\S]*?\.insert\(/);
    expect(acoes).toMatch(/hashDoIp\(/);
    expect(acoes).toContain("VERSAO_DO_TERMO_DE_ADESAO");
  });
});
