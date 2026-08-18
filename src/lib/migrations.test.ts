import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da numeração das migrations.
 *
 * Duas sessões trabalhando em paralelo criaram dois arquivos `0020_` sem
 * que nada reclamasse — e a colisão só apareceu quando alguém leu a pasta
 * por acaso. Como estas migrations são aplicadas à mão (não pelo CLI do
 * Supabase, que rastreia por timestamp), o número é a única coisa que
 * define a ordem de execução: dois arquivos com o mesmo prefixo tornam
 * essa ordem indefinida.
 */
const DIR_MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function migrations(): { arquivo: string; prefixo: string }[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((nome) => nome.endsWith(".sql"))
    .map((arquivo) => ({ arquivo, prefixo: arquivo.slice(0, 4) }));
}

describe("Numeração das migrations", () => {
  it("não tem dois arquivos com o mesmo prefixo", () => {
    const porPrefixo = new Map<string, string[]>();
    for (const { arquivo, prefixo } of migrations()) {
      porPrefixo.set(prefixo, [...(porPrefixo.get(prefixo) ?? []), arquivo]);
    }

    const colisoes = [...porPrefixo.entries()].filter(([, arquivos]) => arquivos.length > 1);

    expect(
      colisoes.map(([prefixo, arquivos]) => `${prefixo}: ${arquivos.join(" e ")}`),
    ).toEqual([]);
  });

  it("usa quatro dígitos no prefixo, seguidos de underscore", () => {
    const foraDoPadrao = migrations()
      .filter(({ arquivo }) => !/^\d{4}_/.test(arquivo))
      .map(({ arquivo }) => arquivo);

    expect(foraDoPadrao).toEqual([]);
  });

  it("não pula números na sequência", () => {
    // Um buraco quase sempre significa arquivo perdido num merge, não uma
    // decisão — e passaria despercebido até alguém tentar recriar o banco
    // do zero.
    const numeros = migrations()
      .map(({ prefixo }) => Number(prefixo))
      .sort((a, b) => a - b);

    const faltando: number[] = [];
    for (let n = numeros[0]; n < numeros[numeros.length - 1]; n++) {
      if (!numeros.includes(n)) faltando.push(n);
    }

    expect(faltando).toEqual([]);
  });
});
