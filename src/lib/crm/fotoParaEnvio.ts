"use client";

import { createClientSobDemanda } from "@/lib/supabase/clientSobDemanda";
import { formatoDoArquivo, motivoDaFalhaDeEnvio } from "./envioDeDocumento";

/**
 * O lado do NAVEGADOR do envio de documento (16/10/2026).
 *
 * A foto do celular sai com 3 a 8 MB e 4000 px de lado. Para o banco ler um
 * RG, 2400 px bastam; o resto é peso no 4G de quem está mandando. Por isso a
 * foto é reduzida aqui, antes de subir, e a HEIC do iPhone sai como JPEG —
 * que o corretor consegue abrir em qualquer computador.
 *
 * Reduzir NUNCA pode piorar o envio: se o navegador não sabe abrir a imagem
 * (HEIC no Chrome do Windows, por exemplo), ou se o resultado não fica menor,
 * vai o arquivo original. PDF não é tocado.
 */

const LADO_MAXIMO = 2400;
const QUALIDADE = 0.85;
/** Abaixo disto a foto já é leve; reprocessar só gastaria tempo (exceto HEIC). */
const LEVE_O_BASTANTE = 1.5 * 1024 * 1024;

async function abrirImagem(arquivo: Blob): Promise<{ largura: number; altura: number; desenhar: (c: CanvasRenderingContext2D, l: number, a: number) => void; fechar: () => void } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // A orientação da câmera (EXIF) já vem aplicada: documento não sai deitado.
      const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
      return {
        largura: bmp.width,
        altura: bmp.height,
        desenhar: (c, l, a) => c.drawImage(bmp, 0, 0, l, a),
        fechar: () => bmp.close(),
      };
    } catch {
      // Cai para o <img>, que no Safari abre HEIC.
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      largura: img.naturalWidth,
      altura: img.naturalHeight,
      desenhar: (c, l, a) => c.drawImage(img, 0, 0, l, a),
      fechar: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** A foto pronta para subir, ou o arquivo como veio quando não há o que ganhar. */
export async function prepararFoto(arquivo: File): Promise<File> {
  const formato = formatoDoArquivo(arquivo);
  if (!formato.startsWith("image/")) return arquivo;
  const ehHeic = formato === "image/heic";
  if (!ehHeic && arquivo.size <= LEVE_O_BASTANTE) return arquivo;

  const imagem = await abrirImagem(arquivo);
  if (!imagem || !imagem.largura || !imagem.altura) return arquivo;
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.largura, imagem.altura));
    const largura = Math.round(imagem.largura * escala);
    const altura = Math.round(imagem.altura * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    // PNG transparente viraria preto no JPEG; fundo branco é o papel.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, largura, altura);
    imagem.desenhar(ctx, largura, altura);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE));
    if (!blob) return arquivo;
    // HEIC vira JPEG mesmo se não ficar menor: é o que o corretor consegue abrir.
    if (!ehHeic && blob.size >= arquivo.size) return arquivo;
    const nome = arquivo.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${nome}.jpg`, { type: "image/jpeg" });
  } catch {
    return arquivo;
  } finally {
    imagem.fechar();
  }
}

/**
 * Sobe o arquivo DIRETO para o armazenamento, com a autorização de uso único
 * que o servidor acabou de gerar. Direto porque a função da Vercel recusa
 * corpo acima de 4,5 MB antes de o nosso código rodar — e era assim que o
 * PDF escaneado e a foto do celular falhavam, com a tela dizendo "sem
 * conexão".
 *
 * O tipo vai explícito no arquivo: com o `type` vazio, o armazenamento
 * receberia "application/octet-stream" e recusaria um arquivo bom.
 */
export async function subirComAutorizacao(p: {
  bucket: string;
  caminho: string;
  autorizacao: string;
  arquivo: File;
}): Promise<{ ok: true } | { erro: string }> {
  const formato = formatoDoArquivo(p.arquivo);
  const corpo = p.arquivo.type === formato ? p.arquivo : new File([p.arquivo], p.arquivo.name, { type: formato });
  try {
    const supabase = await createClientSobDemanda();
    const { error } = await supabase.storage
      .from(p.bucket)
      .uploadToSignedUrl(p.caminho, p.autorizacao, corpo, { contentType: formato });
    if (error) {
      console.error("[documentos] armazenamento recusou:", error.message);
      return { erro: motivoDaFalhaDeEnvio(error) };
    }
    return { ok: true };
  } catch (erro) {
    return { erro: motivoDaFalhaDeEnvio(erro) };
  }
}
