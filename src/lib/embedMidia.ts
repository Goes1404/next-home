/**
 * URL de embed a partir de um link de vídeo colado à mão (YouTube ou Vimeo,
 * em qualquer um dos formatos que o próprio site usa pra compartilhar) —
 * espelha exatamente os padrões que o site legado (Migmidia) já usava.
 */
function youtubeEmbedUrl(url: string): string | null {
  const padroes = [
    /youtube\.com\/watch\?v=([\w-]+)/,
    /youtu\.be\/([\w-]+)/,
    /youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/,
    /youtube\.com\/shorts\/([\w-]+)/,
  ];
  for (const padrao of padroes) {
    const m = url.match(padrao);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  }
  return null;
}

function vimeoEmbedUrl(url: string): string | null {
  const padroes = [/vimeo\.com\/(\d+)/, /player\.vimeo\.com\/video\/(\d+)/];
  for (const padrao of padroes) {
    const m = url.match(padrao);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
}

/**
 * `null` quando `url` não é um link de YouTube/Vimeo reconhecível — nesse
 * caso o chamador cai pro `<video>` nativo, tratando `url` como um arquivo
 * (ex.: um mp4 subido direto no nosso Storage).
 */
export function videoEmbedUrl(url: string): string | null {
  return youtubeEmbedUrl(url) ?? vimeoEmbedUrl(url);
}

/** Id do vídeo do YouTube, para thumbnail (`i.ytimg.com`) e facade leve. */
export function youtubeId(url: string): string | null {
  const padroes = [
    /youtube\.com\/watch\?v=([\w-]+)/,
    /youtu\.be\/([\w-]+)/,
    /youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/,
    /youtube\.com\/shorts\/([\w-]+)/,
  ];
  for (const padrao of padroes) {
    const m = url.match(padrao);
    if (m) return m[1];
  }
  return null;
}

/**
 * Valida o que o corretor colou no editor de mídias externas.
 *
 * - "video": precisa ser YouTube/Vimeo reconhecível ou arquivo de vídeo
 *   direto (https). Um link de página qualquer viraria iframe quebrado.
 * - "tour360": qualquer página https serve (Matterport, Kuula, tour da
 *   construtora...) — é embedada como iframe.
 */
export function validarUrlMidiaExterna(
  tipo: "video" | "tour360",
  url: string,
): { ok: true; url: string } | { ok: false; erro: string } {
  const limpa = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(limpa);
  } catch {
    return { ok: false, erro: "Cole a URL completa, começando com https://" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, erro: "Só aceitamos links https:// — o navegador bloqueia http dentro do site." };
  }

  if (tipo === "video") {
    const ehEmbed = videoEmbedUrl(limpa) !== null;
    const ehArquivo = /\.(mp4|webm|mov)(\?.*)?$/i.test(parsed.pathname);
    if (!ehEmbed && !ehArquivo) {
      return {
        ok: false,
        erro: "Não reconheci este link de vídeo. Cole um link do YouTube (watch, youtu.be ou Shorts), do Vimeo, ou de um arquivo .mp4.",
      };
    }
  }

  return { ok: true, url: limpa };
}
