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
