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
