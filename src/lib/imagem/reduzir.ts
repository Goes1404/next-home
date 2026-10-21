// Reduzir a imagem NO NAVEGADOR antes de enviar (21/10/2026).
//
// Foto de celular passa fácil de 5 MB (e da folga de 4,5 MB do corpo de uma
// função da Vercel); a pessoa escolhe a imagem, espera que ela suba, e o
// envio falha. Aqui a imagem é reduzida (lado maior e qualidade) até caber no
// limite. A parte que decide (dimensões, formato de saída, mensagens) é pura
// e testada; só `prepararImagemParaEnvio` toca em canvas.

export type OpcoesDeReducao = {
  /** Lado maior, em pixels, que a imagem pode ter. */
  ladoMaior: number;
  /** O tamanho que o arquivo enviado precisa caber, em bytes. */
  tetoBytes: number;
};

/** Capa do site: lado maior 2400 px, até 4 MB (abaixo dos 4,5 MB de corpo da Vercel e dos 5 MB do servidor). */
export const REDUCAO_DA_CAPA: OpcoesDeReducao = { ladoMaior: 2400, tetoBytes: 4 * 1024 * 1024 };
/** Logo: lado maior 800 px, até 1 MB (o limite do servidor). */
export const REDUCAO_DA_LOGO: OpcoesDeReducao = { ladoMaior: 800, tetoBytes: 1024 * 1024 };

export const MENSAGEM_HEIC =
  "O iPhone salva fotos em HEIC e este navegador não consegue abri-las. Tire um print da foto ou exporte como JPG e escolha de novo.";
export const MENSAGEM_NAO_E_IMAGEM = "Esse arquivo não parece uma imagem. Escolha um JPG, PNG ou WebP.";
export const MENSAGEM_ENORME = "A imagem continua grande demais mesmo reduzida. Escolha uma imagem menor.";

/** As dimensões depois de reduzir: o lado maior vira `ladoMaior`, a proporção fica. Nunca amplia. */
export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMaior: number,
): { largura: number; altura: number; reduziu: boolean } {
  const maior = Math.max(largura, altura);
  if (!(maior > ladoMaior) || largura <= 0 || altura <= 0) return { largura, altura, reduziu: false };
  const fator = ladoMaior / maior;
  return {
    largura: Math.max(1, Math.round(largura * fator)),
    altura: Math.max(1, Math.round(altura * fator)),
    reduziu: true,
  };
}

/** HEIC/HEIF pelo tipo declarado ou pela extensão (o iPhone às vezes nem declara o tipo). */
export function ehHeic(arquivo: { name: string; type: string }): boolean {
  return /^image\/hei[cf]$/i.test(arquivo.type) || /\.hei[cf]$/i.test(arquivo.name);
}

export type TipoDeSaida = "image/png" | "image/jpeg" | "image/webp";

/**
 * O tipo que sai da redução. PNG continua PNG (a logo com transparência não
 * ganha fundo preto), WebP continua WebP e o resto vira JPEG.
 */
export function tipoDeSaida(tipoOriginal: string): TipoDeSaida {
  if (tipoOriginal === "image/png") return "image/png";
  if (tipoOriginal === "image/webp") return "image/webp";
  return "image/jpeg";
}

/** Os três tipos que o servidor aceita (JPG, PNG, WebP). */
export function ehTipoAceito(tipo: string): tipo is TipoDeSaida {
  return tipo === "image/png" || tipo === "image/jpeg" || tipo === "image/webp";
}

export function extensaoDoTipo(tipo: TipoDeSaida): string {
  return tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
}

/** O nome do arquivo reduzido: o mesmo, com a extensão do tipo que saiu. */
export function nomeDoArquivoReduzido(nomeOriginal: string, tipo: TipoDeSaida): string {
  const base = nomeOriginal.replace(/\.[^./\\]+$/, "").trim() || "imagem";
  return `${base}.${extensaoDoTipo(tipo)}`;
}

/**
 * As tentativas, da mais leve para a mais pesada de reduzir: qualidade e fator
 * sobre o lado já reduzido. PNG não tem qualidade: depois da primeira tentativa
 * ele só encolhe, e o último recurso é WebP (que também guarda transparência).
 */
export const TENTATIVAS: readonly { qualidade: number; escala: number }[] = [
  { qualidade: 0.85, escala: 1 },
  { qualidade: 0.8, escala: 0.85 },
  { qualidade: 0.72, escala: 0.7 },
  { qualidade: 0.65, escala: 0.55 },
  { qualidade: 0.55, escala: 0.4 },
];

export type ResultadoDoPreparo = { ok: true; arquivo: File; reduziu: boolean } | { ok: false; erro: string };

type Aberta = { fonte: CanvasImageSource; largura: number; altura: number; fechar: () => void };

async function abrir(arquivo: File): Promise<Aberta | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(arquivo);
      return { fonte: bmp, largura: bmp.width, altura: bmp.height, fechar: () => bmp.close() };
    }
  } catch {
    // cai no <img>, que decodifica alguns formatos que o createImageBitmap recusa
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, fechar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function paraBlob(canvas: HTMLCanvasElement, tipo: TipoDeSaida, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/**
 * Deixa a imagem pronta para enviar: devolve o MESMO arquivo quando ele já cabe
 * (tamanho e dimensões), e um reduzido quando não. HEIC que o navegador não
 * abre, e arquivo que não é imagem, voltam com a mensagem que diz o que fazer.
 */
export async function prepararImagemParaEnvio(arquivo: File, opcoes: OpcoesDeReducao): Promise<ResultadoDoPreparo> {
  const heic = ehHeic(arquivo);
  const aberta = await abrir(arquivo);
  if (!aberta) {
    return { ok: false, erro: heic ? MENSAGEM_HEIC : MENSAGEM_NAO_E_IMAGEM };
  }
  try {
    const alvo = dimensoesReduzidas(aberta.largura, aberta.altura, opcoes.ladoMaior);
    // Cabe como está: nada a fazer (e a logo/capa original segue sem recompressão).
    const jaAceito = ehTipoAceito(arquivo.type);
    if (jaAceito && !alvo.reduziu && arquivo.size <= opcoes.tetoBytes) return { ok: true, arquivo, reduziu: false };

    let tipo = tipoDeSaida(jaAceito ? arquivo.type : "image/jpeg");
    for (const t of TENTATIVAS) {
      const largura = Math.max(1, Math.round(alvo.largura * t.escala));
      const altura = Math.max(1, Math.round(alvo.altura * t.escala));
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { ok: false, erro: MENSAGEM_NAO_E_IMAGEM };
      ctx.drawImage(aberta.fonte, 0, 0, largura, altura);
      let blob = await paraBlob(canvas, tipo, t.qualidade);
      // PNG que não coube na primeira tentativa: WebP guarda transparência com muito menos bytes.
      if (blob && blob.size > opcoes.tetoBytes && tipo === "image/png") {
        const webp = await paraBlob(canvas, "image/webp", t.qualidade);
        if (webp && webp.type === "image/webp") {
          blob = webp;
          tipo = "image/webp";
        }
      }
      if (blob && blob.type === tipo && blob.size <= opcoes.tetoBytes) {
        return {
          ok: true,
          arquivo: new File([blob], nomeDoArquivoReduzido(arquivo.name, tipo), { type: tipo }),
          reduziu: true,
        };
      }
    }
    return { ok: false, erro: MENSAGEM_ENORME };
  } finally {
    aberta.fechar();
  }
}
