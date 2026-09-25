import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chaveDaFoto } from "./lerPagina";

/**
 * F4 do importador do site (0113): o imóvel lembra a página de onde veio, e
 * cada foto lembra o endereço que tinha no site.
 *
 * As duas colunas são escritas e lidas por consultas À PARTE, com o erro
 * engolido. Se alguma delas entrar no insert de `registrarMidia` ou no SELECT
 * do catálogo, a importação (ou a tela do imóvel) cai inteira enquanto a
 * migration não estiver aplicada — o incidente de 07/09, quando a 0101 subiu
 * no código e não no banco.
 */

const raiz = join(__dirname, "..", "..", "..", "..");
const ler = (caminho: string) =>
  readFileSync(join(raiz, caminho), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("as colunas da 0113 nunca entram no caminho que não pode cair", () => {
  it("o insert de registrarMidia não cita origem_url", () => {
    expect(ler("src/lib/imoveis/registrarMidia.ts")).not.toContain("origem_url");
  });

  it("o SELECT do catálogo do painel não cita site_construtora", () => {
    expect(ler("src/lib/imoveis/catalogoDoPainel.ts")).not.toContain("site_construtora");
  });

  it("quem grava origem_url grava a CHAVE da foto, não a URL crua", () => {
    const acoes = ler("src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts");
    expect(acoes).toMatch(/origem_url:\s*chaveDaFoto\(/);
    expect(acoes).toMatch(/jaTrazida:\s*trazidas\.has\(chaveDaFoto\(/);
  });
});

describe("chaveDaFoto reconhece a mesma foto na próxima leitura", () => {
  it("tamanho e formato diferentes são a mesma foto", () => {
    const a = chaveDaFoto("https://www.construtora.com.br/fotos/fachada-800x600.jpg?v=3");
    const b = chaveDaFoto("https://construtora.com.br/fotos/fachada.jpg.webp");
    expect(a).toBe(b);
  });

  it("fotos diferentes continuam diferentes", () => {
    expect(chaveDaFoto("https://c.com.br/fotos/fachada.jpg")).not.toBe(chaveDaFoto("https://c.com.br/fotos/piscina.jpg"));
  });
});
