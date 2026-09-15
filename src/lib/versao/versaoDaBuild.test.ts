import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { houveDeploy, pareceChunkQueSumiu, VERSAO_DE_DESENVOLVIMENTO } from "./versaoDaBuild";

describe("houveDeploy — o lado errado de errar é o falso positivo", () => {
  it("carimbos diferentes = houve deploy", () => {
    expect(houveDeploy("abc123", "def456")).toBe(true);
  });

  it("carimbos iguais não anunciam nada", () => {
    expect(houveDeploy("abc123", "abc123")).toBe(false);
    expect(houveDeploy("abc123", "  abc123  ")).toBe(false);
  });

  it("desenvolvimento nunca avisa — o build local roda o tempo todo", () => {
    expect(houveDeploy(VERSAO_DE_DESENVOLVIMENTO, "abc123")).toBe(false);
    expect(houveDeploy("abc123", VERSAO_DE_DESENVOLVIMENTO)).toBe(false);
  });

  it("carimbo ausente dos dois lados cala, em vez de acusar deploy", () => {
    expect(houveDeploy("", "abc123")).toBe(false);
    expect(houveDeploy("abc123", "")).toBe(false);
    expect(houveDeploy("abc123", "   ")).toBe(false);
  });

  it("resposta que não é texto cala — servidor torto não é build nova", () => {
    for (const lixo of [undefined, null, 42, {}, [], true]) {
      expect(houveDeploy("abc123", lixo), String(lixo)).toBe(false);
    }
  });
});

describe("pareceChunkQueSumiu — só gatilho, nunca diagnóstico", () => {
  it("reconhece as formas que o navegador usa para chunk que virou 404", () => {
    const erro = new Error("Loading chunk 483 failed.");
    erro.name = "ChunkLoadError";
    expect(pareceChunkQueSumiu(erro)).toBe(true);
    expect(pareceChunkQueSumiu(new Error("Failed to fetch dynamically imported module: /x.js"))).toBe(
      true,
    );
    expect(pareceChunkQueSumiu("error loading dynamically imported module")).toBe(true);
  });

  it("não confunde erro comum com deploy", () => {
    for (const outro of [
      new Error("NetworkError when attempting to fetch resource."),
      new Error("Cannot read properties of undefined"),
      null,
      undefined,
      123,
    ]) {
      expect(pareceChunkQueSumiu(outro), String(outro)).toBe(false);
    }
  });
});

/*
 * Guarda de código-fonte, da mesma família das outras desta base: a
 * regressão aqui falha CALADA. Se `/api/versao` perder o `no-store`, ela
 * passa a ser cacheada, devolve o carimbo velho para sempre e o aviso nunca
 * aparece — com build verde, tela funcionando e nenhum erro em lugar nenhum.
 * O recurso vira decoração, que é o padrão que este projeto mais repete.
 */
describe("a rota de versão não pode ser cacheada nem cara", () => {
  /*
   * Comentário SAI antes de qualquer acusação. A primeira versão desta
   * guarda reprovou a rota porque o comentário dela explica que a resposta
   * "não lê arquivo, cookie nem Supabase" — a palavra estava lá, o código
   * não. É a mesma pedra que `tokensDeTema`, `escalaDoPainel` e
   * `gravacaoDeMensagem` já pisaram nesta base.
   */
  const rota = readFileSync(join(process.cwd(), "src/app/api/versao/route.ts"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("responde no-store", () => {
    expect(rota).toMatch(/["']cache-control["']\s*:\s*["'][^"']*no-store/i);
  });

  it("é forçada a dinâmica — senão o Next a resolve no build", () => {
    expect(rota).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  it("não toca no banco: a aba pergunta o dia inteiro", () => {
    expect(rota).not.toMatch(/supabase/i);
  });
});
