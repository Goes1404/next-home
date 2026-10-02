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

describe("tipo de imagem pelos primeiros bytes (servidor que não diz o tipo)", () => {
  it("reconhece JPEG, PNG e WebP", async () => {
    const { tipoPelaAssinatura } = await import("./buscarSeguro");
    expect(tipoPelaAssinatura(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(tipoPelaAssinatura(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
    expect(tipoPelaAssinatura(webp)).toBe("image/webp");
  });

  it("HTML sem tipo continua não sendo imagem", async () => {
    const { tipoPelaAssinatura } = await import("./buscarSeguro");
    expect(tipoPelaAssinatura(Buffer.from("<!doctype html><html>"))).toBeNull();
    expect(tipoPelaAssinatura(Buffer.alloc(0))).toBeNull();
  });

  it("o tipo DECLARADO pelo servidor vence; a assinatura só entra quando ele falta", () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), "src/lib/imoveis/site/buscarSeguro.ts"), "utf8");
    expect(fonte).toMatch(/declarado && !declarado\.startsWith\("application\/octet-stream"\)\s*\?\s*declarado\s*:\s*\(tipoPelaAssinatura\(bytes\)/);
  });
});
