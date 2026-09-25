import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A trava anti-SSRF só protege quem PASSA por ela. A regressão é calada: um
 * `fetch(url)` direto numa action do importador funciona perfeitamente para
 * todo site de construtora — e abre a rede interna para qualquer link colado.
 */
const RAIZ = path.resolve(__dirname, "../../../..");
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("busca de URL colada pelo corretor", () => {
  it("toda busca da origem Site passa por buscarSeguro, nunca por fetch", () => {
    const acoes = fs.readFileSync(
      path.join(RAIZ, "src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts"),
      "utf8",
    );
    const ini = acoes.indexOf("Origem: site da construtora");
    expect(ini, "seção da origem Site não encontrada").toBeGreaterThan(0);
    const secao = semComentario(acoes.slice(ini));
    expect(secao).not.toMatch(/\bfetch\s*\(/);
    expect((secao.match(/buscarSeguro\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("a conexão confere o IP no momento de conectar (DNS rebinding)", () => {
    const fonte = semComentario(fs.readFileSync(path.join(__dirname, "buscarSeguro.ts"), "utf8"));
    expect(fonte).toMatch(/lookup:\s*lookupSeguro/);
    expect(fonte).toMatch(/enderecoProibido\(/);
    // Cada redirecionamento passa pela validação inteira de novo.
    expect(fonte).toMatch(/alvo = validarUrlPublica\(new URL\(resposta\.cabecalhos\.location/);
  });
});
