import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Guarda de código-fonte. "Escolher do catálogo" liga à planta uma imagem que
 * talvez esteja como FOTO. A assistente só manda planta com
 * `midias.tipo = 'planta'`, então ligar a URL sem reclassificar faria a tela
 * mostrar a planta e a assistente seguir sem ela — calado.
 */
const fonte = readFileSync(join(__dirname, "EditorTipologias.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("EditorTipologias — escolher do catálogo", () => {
  it("reclassifica como planta antes de ligar a imagem, e desiste se falhar", () => {
    const inicio = fonte.indexOf("const escolherDoCatalogo = async");
    expect(inicio).toBeGreaterThan(-1);
    const corpo = fonte.slice(inicio, fonte.indexOf("\n  };\n", inicio));
    const reclassifica = corpo.indexOf('definirTipoDaMidia(midia.id!, "planta"');
    const desiste = corpo.indexOf("return;");
    const liga = corpo.indexOf('onChange(index, "plantaUrl", midia.url)');
    expect(reclassifica).toBeGreaterThan(-1);
    expect(desiste).toBeGreaterThan(reclassifica);
    expect(liga).toBeGreaterThan(desiste);
  });
});
