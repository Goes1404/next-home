/**
 * Tudo que se tira de uma imagem depois de decodificá-la uma vez: a medida
 * real, o placeholder borrado da vitrine, e a prévia pequena da curadoria.
 *
 * As três moram juntas porque nascem da mesma decodificação, e porque a
 * receita do blur não é escolha nova: `scripts/gerar-blur.mjs` já produzia
 * exatamente 12px em WebP q45 para as fotos que estão no ar. Mudar o
 * tamanho aqui faria as fotos novas terem placeholder diferente das antigas.
 *
 * O `sharp` é carregado SOB DEMANDA, e não no topo do módulo, porque ele é
 * binário nativo: quando o `.so` não chega ao runtime, o import estoura
 * ANTES de qualquer try/catch e derruba a página inteira com o erro genérico
 * de Server Components. Foi o que aconteceu em produção — e levou junto o
 * editor do imóvel, que nem usa importação. Assim, o pior caso passa a ser
 * foto sem medida e sem blur, não tela quebrada.
 */

type Sharp = (typeof import("sharp"))["default"];

let modulo: Sharp | null | undefined;

async function carregarSharp(): Promise<Sharp | null> {
  if (modulo !== undefined) return modulo;
  try {
    modulo = (await import("sharp")).default;
  } catch (erro) {
    console.error("[imagem] sharp indisponível neste runtime:", erro);
    modulo = null;
  }
  return modulo;
}

/** Para a tela poder dizer POR QUE não veio prévia nenhuma. */
export async function sharpDisponivel(): Promise<boolean> {
  return (await carregarSharp()) !== null;
}

export async function medirImagem(bytes: Buffer): Promise<{ largura: number; altura: number } | null> {
  const sharp = await carregarSharp();
  if (!sharp) return null;

  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    return { largura: meta.width, altura: meta.height };
  } catch {
    return null;
  }
}

export async function gerarBlur(bytes: Buffer): Promise<string | null> {
  const sharp = await carregarSharp();
  if (!sharp) return null;

  try {
    const miniatura = await sharp(bytes).resize(12).webp({ quality: 45 }).toBuffer();
    return `data:image/webp;base64,${miniatura.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Prévia da grade de curadoria, com um palpite de foto vs planta.
 *
 * Planta é clara e quase sem cor; foto de fachada ou de decorado não é nem
 * uma coisa nem outra. É palpite para PRÉ-marcar a grade — quem decide é o
 * corretor. Feito com `stats()` em vez de IA de visão porque a cota gratuita
 * do Gemini é de 20 chamadas por dia e é a mesma que atende cliente no
 * WhatsApp: classificar foto gastaria o balde do atendimento.
 */
export async function gerarPreview(
  bytes: Buffer,
): Promise<{ dataUrl: string; parecePlanta: boolean; pareceGrafismo: boolean } | null> {
  const sharp = await carregarSharp();
  if (!sharp) return null;

  try {
    const imagem = sharp(bytes);
    const [previa, stats, meta] = await Promise.all([
      imagem.clone().resize(400).webp({ quality: 60 }).toBuffer(),
      imagem.clone().stats(),
      imagem.clone().metadata(),
    ]);

    const medias = stats.channels.slice(0, 3).map((canal) => canal.mean);
    const clara = medias.every((m) => m > 225);
    const semCor = Math.max(...medias) - Math.min(...medias) < 12;

    return {
      dataUrl: `data:image/webp;base64,${previa.toString("base64")}`,
      parecePlanta: clara && semCor,
      // Um canal só é escala de cinza. Medido em dois books reais de
      // construtora: TODA imagem de um canal era letreiro, logo ou máscara
      // de recorte — nenhuma era foto. Foto de empreendimento é sempre RGB.
      pareceGrafismo: meta.channels === 1,
    };
  } catch {
    return null;
  }
}
