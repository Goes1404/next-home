import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extrairImagensDePdf } from "./pdfImagens";

/** PDF mínimo com um XObject de imagem JPEG embutido. */
function pdfComJpeg(jpeg: Buffer, largura: number, altura: number): Buffer {
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura}` +
    ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n`;
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n${dicionario}stream\n`, "latin1"),
    jpeg,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

async function jpegDeTeste(largura: number, altura: number): Promise<Buffer> {
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer();
}

describe("extrairImagensDePdf — JPEG embutido", () => {
  it("devolve os bytes do JPEG sem recodificar, com as dimensões do dicionário", async () => {
    const jpeg = await jpegDeTeste(640, 480);
    const resultado = extrairImagensDePdf(pdfComJpeg(jpeg, 640, 480));

    expect(resultado.imagens).toHaveLength(1);
    expect(resultado.imagens[0].mime).toBe("image/jpeg");
    expect(resultado.imagens[0].largura).toBe(640);
    expect(resultado.imagens[0].altura).toBe(480);
    // Sem recodificar: os bytes são idênticos aos que entraram.
    expect(resultado.imagens[0].bytes.equals(jpeg)).toBe(true);
  });

  it("descarta imagem pequena demais para ser foto (ícone, logo)", async () => {
    const jpeg = await jpegDeTeste(80, 80);
    const resultado = extrairImagensDePdf(pdfComJpeg(jpeg, 80, 80));

    expect(resultado.imagens).toHaveLength(0);
    expect(resultado.descartadasPorTamanho).toBe(1);
  });

  it("devolve vazio para arquivo que não é PDF, sem lançar", () => {
    const resultado = extrairImagensDePdf(Buffer.from("isto não é um pdf"));
    expect(resultado.imagens).toHaveLength(0);
  });
});

/** PDF com bitmap RGB cru comprimido em Flate (sem JPEG no meio). */
function pdfComBitmapFlate(largura: number, altura: number): Buffer {
  const pixels = Buffer.alloc(largura * altura * 3, 0x80);
  const comprimido = deflateSync(pixels);
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura}` +
    ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${comprimido.length} >>\n`;
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n${dicionario}stream\n`, "latin1"),
    comprimido,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

/** PDF com imagem em codec que não sabemos ler. */
function pdfComJpx(largura: number, altura: number): Buffer {
  const conteudo = Buffer.alloc(5000, 0x11);
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura}` +
    ` /Filter /JPXDecode /Length ${conteudo.length} >>\n`;
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n${dicionario}stream\n`, "latin1"),
    conteudo,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

describe("extrairImagensDePdf — bitmap cru e codec desconhecido", () => {
  it("remonta um PNG legível a partir de bitmap RGB comprimido em Flate", async () => {
    const resultado = extrairImagensDePdf(pdfComBitmapFlate(300, 240));

    expect(resultado.imagens).toHaveLength(1);
    expect(resultado.imagens[0].mime).toBe("image/png");

    // Prova de que o PNG remontado é válido: o sharp lê e confere as medidas.
    const meta = await sharp(resultado.imagens[0].bytes).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(240);
  });

  it("conta o codec que não sabe ler em vez de sumir com a imagem", () => {
    const resultado = extrairImagensDePdf(pdfComJpx(1200, 800));

    expect(resultado.imagens).toHaveLength(0);
    expect(resultado.naoSuportadas).toEqual([{ codec: "JPXDecode", quantidade: 1 }]);
  });
});
