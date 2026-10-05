import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  citaOImovel,
  diaEmSaoPauloISO,
  ehClienteDePessoa,
  ipDaRequisicao,
  remetenteResumido,
  visitanteDoClique,
} from "./medicaoDoLink";

describe("visitanteDoClique", () => {
  const base = { ip: "200.1.2.3", userAgent: "Mozilla/5.0 Android", dia: "2026-10-05", segredo: "s" };

  it("o mesmo aparelho no mesmo dia é a mesma pessoa", () => {
    expect(visitanteDoClique(base)).toBe(visitanteDoClique({ ...base }));
  });

  it("muda no dia seguinte, para não seguir ninguém pela semana", () => {
    expect(visitanteDoClique(base)).not.toBe(visitanteDoClique({ ...base, dia: "2026-10-06" }));
  });

  it("não carrega o IP no resumo", () => {
    expect(visitanteDoClique(base)).not.toContain("200.1.2.3");
  });

  it("sem IP ou sem navegador não há pessoa", () => {
    expect(visitanteDoClique({ ...base, ip: null })).toBeNull();
    expect(visitanteDoClique({ ...base, userAgent: null })).toBeNull();
  });
});

describe("ipDaRequisicao", () => {
  it("pega o primeiro IP do x-forwarded-for", () => {
    expect(ipDaRequisicao(new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }))).toBe("200.1.2.3");
  });
});

describe("remetenteResumido", () => {
  it("ignora a pontuação e não guarda o telefone", () => {
    const a = remetenteResumido("5511988881111", "s");
    expect(a).toBe(remetenteResumido("+55 (11) 98888-1111", "s"));
    expect(a).not.toContain("988881111");
  });
});

describe("ehClienteDePessoa", () => {
  it("tira o robô da Meta e quem vem sem navegador", () => {
    expect(ehClienteDePessoa("facebookexternalhit/1.1")).toBe(false);
    expect(ehClienteDePessoa(null)).toBe(false);
    expect(ehClienteDePessoa("Mozilla/5.0 (Linux; Android 13; wv) Instagram 300")).toBe(true);
  });
});

describe("citaOImovel", () => {
  it("casa nome ou apelido inteiro, sem acento e sem caixa", () => {
    expect(citaOImovel("oi, vi o anúncio do Dom Parque", ["Lançamento ao Lado do Parque", "Dom Parque"])).toBe(true);
    expect(citaOImovel("quero saber do lancamento ao lado do parque", ["Lançamento ao Lado do Parque"])).toBe(true);
  });

  it("não casa pedaço de palavra nem termo curto", () => {
    expect(citaOImovel("domparquet", ["Dom Parque"])).toBe(false);
    expect(citaOImovel("oi tudo bem", ["Oi"])).toBe(false);
  });
});

describe("diaEmSaoPauloISO", () => {
  it("às 22h de Brasília ainda é o mesmo dia (em UTC já seria amanhã)", () => {
    expect(diaEmSaoPauloISO(new Date("2026-10-06T01:00:00Z"))).toBe("2026-10-05");
  });
});

describe("a contagem do porteiro não grava texto (0159)", () => {
  const fonte = readFileSync(join(__dirname, "repositorio.ts"), "utf8");
  const inicio = fonte.indexOf("export async function registrarMensagemBarrada");
  const corpo = fonte.slice(inicio, fonte.indexOf("\nexport ", inicio + 10));
  const gravacao = corpo.slice(corpo.indexOf('.from("porteiro_barrados").upsert('));

  it("o upsert não leva o texto nem o telefone cru", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(gravacao).not.toMatch(/\btexto\s*:|conteudo|p\.texto/);
    expect(gravacao).not.toMatch(/\btelefone\s*:/);
    expect(gravacao).toMatch(/remetenteResumido\(/);
  });
});
