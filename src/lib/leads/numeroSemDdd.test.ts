/**
 * O 55 que virava DDD (09/10/2026).
 *
 * Relato: "enviar o xlsx, ele coloca o 55 como DDD". Com o número inteiro na
 * planilha (5511981918127) a leitura sempre esteve certa; o "(55)" aparecia
 * quando a célula tinha 11 dígitos começando com 55: o 55 do país com um
 * número sem DDD ("+55 98191-8127", como a Meta grava quem digita sem DDD) ou
 * um número já cortado ("55119819181"). Os dois eram lidos como DDD 55.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./leituraPorIa", () => ({ lerListaComIa: () => ({ ok: false }) }));
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: () => null }));

import { formatarTelefoneBr, normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import { avisoDeNumerosCortados, avisoDeNumerosSemDdd, dedupInterno, parsearTabelaLeads } from "./importacao";

describe("o 55 do país não vira DDD", () => {
  it("com o + na frente, o 55 é sempre o país", () => {
    expect(normalizarTelefoneBrasileiro("+55 98191-8127")).toBe("5511981918127");
    expect(normalizarTelefoneBrasileiro("p:+55981918127")).toBe("5511981918127");
    // DDD 55 de verdade, com o país: 13 dígitos.
    expect(normalizarTelefoneBrasileiro("+55 55 99123-4567")).toBe("5555991234567");
  });

  it("número sem forma de telefone daqui não vira telefone", () => {
    // 13 dígitos cortados para 11: lido como DDD 55, o celular começaria com 1.
    expect(normalizarTelefoneBrasileiro("55119819181")).toBeNull();
    expect(formatarTelefoneBr("55119819181")).toBe("55119819181");
    expect(normalizarTelefoneBrasileiro("11 1234-5678")).toBeNull();
    expect(normalizarTelefoneBrasileiro("00 98191-8127")).toBeNull();
    // Americano de onze dígitos virava "(14) …".
    expect(normalizarTelefoneBrasileiro("14155552671")).toBeNull();
  });

  it("o zero de discagem a distância sai", () => {
    expect(normalizarTelefoneBrasileiro("011 98191-8127")).toBe("5511981918127");
    expect(normalizarTelefoneBrasileiro("+55 011 98191-8127")).toBe("5511981918127");
  });

  it("número de DDD 55 sozinho continua sendo do DDD 55", () => {
    expect(normalizarTelefoneBrasileiro("55 98191-8127")).toBe("5555981918127");
    expect(normalizarTelefoneBrasileiro("(55) 3222-1234")).toBe("555532221234");
  });
});

describe("tabela com 55 na frente", () => {
  const TABELA = [
    "Nome;Telefone",
    "Ana;5511981918101",
    "Bia;5521981918102",
    "Caio;5531981918103",
    "Davi;5513981918104",
    "Sem DDD;55981918106",
    "Mais um sem DDD;+55 98191-8107",
    "Cortado;55119819181",
    "Santa Maria;5555991234509",
  ].join("\n");

  it("número curto com 55 vem sem DDD, desmarcado; o impossível vem em branco", () => {
    const linhas = dedupInterno(parsearTabelaLeads(TABELA));
    expect(linhas.map((l) => [l.nome, l.telefone, l.telefoneE164, l.semDdd ?? false, l.telefoneCortado ?? null])).toEqual([
      ["Ana", "5511981918101", "5511981918101", false, null],
      ["Bia", "5521981918102", "5521981918102", false, null],
      ["Caio", "5531981918103", "5531981918103", false, null],
      ["Davi", "5513981918104", "5513981918104", false, null],
      ["Sem DDD", "981918106", null, true, null],
      ["Mais um sem DDD", "981918107", null, true, null],
      ["Cortado", "", null, false, "55119819181"],
      ["Santa Maria", "5555991234509", "5555991234509", false, null],
    ]);
  });

  it("os avisos dizem o que faltou em cada caso", () => {
    const linhas = dedupInterno(parsearTabelaLeads(TABELA));
    expect(avisoDeNumerosSemDdd(linhas)).toContain("2 telefones vieram com o 55 do país mas sem o DDD");
    const cortados = avisoDeNumerosCortados(linhas) ?? "";
    expect(cortados).toContain("1 telefone veio incompleto");
    expect(cortados).not.toContain("notação");
  });

  it("tabela sem o 55 do país não reinterpreta o DDD 55", () => {
    const linhas = parsearTabelaLeads(
      ["Nome;Telefone", "Ana;11981918101", "Bia;21981918102", "Caio;31981918103", "Santa Maria;55981918106"].join("\n"),
    );
    expect(linhas.at(-1)).toMatchObject({ telefoneE164: "5555981918106" });
    expect(linhas.at(-1)?.semDdd).toBeUndefined();
  });
});
