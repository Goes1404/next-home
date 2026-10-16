import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * A Rute ficou com quatro leads na carteira da Carol (16/10/2026): a mesma
 * planilha foi importada duas vezes e o servidor gravou tudo, porque só a
 * tela sabia o que "já existe". A regressão é calada: a importação funciona,
 * só que duplica — e cada duplicado vira um envio a mais na lista.
 */
describe("a importação não grava telefone já cadastrado", () => {
  const fonte = fs
    .readFileSync(path.join(__dirname, "actions.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const ini = fonte.indexOf("export async function importarLeads");
  const corpo = fonte.slice(ini, fonte.indexOf("\nexport async function", ini + 10));

  it("confere os telefones existentes antes de inserir", () => {
    const confere = corpo.indexOf('.in("telefone_e164", chaves)');
    const insere = corpo.indexOf('.from("leads").insert(');
    expect(confere).toBeGreaterThan(-1);
    expect(insere).toBeGreaterThan(confere);
  });

  it("insere só as linhas novas", () => {
    expect(corpo).toContain("novas.slice(i, i + TAMANHO_LOTE)");
    expect(corpo).not.toContain("linhas.slice(i, i + TAMANHO_LOTE)");
  });
});
