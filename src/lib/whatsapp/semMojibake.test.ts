import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Arquivos salvos uma vez com a codificação errada mostravam ao gestor o
 * "número central" e o "não foi possível" com os acentos estragados. O padrão
 * abaixo é o rastro do UTF-8 lido como cp1252: "A com til" seguido de outro
 * caractere alto, "a circunflexo + euro", "A circunflexo + espaço".
 */
const MOJIBAKE = /Ã[\u0080-¿]|â€|Â[ -¿]/;

const ARQUIVOS = [
  ["src", "app", "corretor", "(painel)", "admin", "whatsapp", "acoes.ts"],
  ["src", "lib", "whatsapp", "provider.ts"],
  ["src", "app", "api", "cron", "followups", "route.ts"],
  ["src", "lib", "crm", "enviosDeLeadParaGrupo.test.ts"],
];

describe("textos sem acento estragado", () => {
  for (const partes of ARQUIVOS) {
    it(partes.at(-1)!, () => {
      const linhas = readFileSync(join(process.cwd(), ...partes), "utf8").split("\n");
      const estragadas = linhas.flatMap((linha, i) => (MOJIBAKE.test(linha) ? [`${i + 1}: ${linha.trim()}`] : []));
      expect(estragadas).toEqual([]);
    });
  }
});
