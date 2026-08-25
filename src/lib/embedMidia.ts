/**
 * URL de embed a partir de um link de vídeo colado à mão (YouTube ou Vimeo,
 * em qualquer um dos formatos que o próprio site usa pra compartilhar) —
 * espelha exatamente os padrões que o site legado (Migmidia) já usava.
 */
/** Id do YouTube tem 11 caracteres; o resto é caminho de página, não vídeo. */
const VALIDO = /^[\w-]{6,20}$/;

/**
 * Id do vídeo do YouTube em qualquer forma que o app produz ao compartilhar.
 *
 * O `?v=` sai por `searchParams`, não por regex de texto: o app do celular
 * compartilha `watch?app=desktop&v=ID`, e um padrão que exigia `watch?v=`
 * literal RECUSAVA justamente o link que o corretor cola do telefone — que é
 * de onde ele trabalha. Um formato que o sistema não reconhece vira "não
 * consegui salvar", e o corretor conclui que a plataforma não tem vídeo.
 */
function youtubeIdDaUrl(url: string): string | null {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url.trim());
  } catch {
    parsed = null;
  }

  const host = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";
  const ehYoutube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be";

  if (parsed && ehYoutube) {
    // youtu.be/ID — o id é o próprio caminho.
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      if (VALIDO.test(id)) return id;
    }

    const doParametro = parsed.searchParams.get("v");
    if (doParametro && VALIDO.test(doParametro)) return doParametro;

    // /embed/ID, /shorts/ID, /live/ID e /v/ID — o id é o segmento seguinte.
    const m = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/);
    if (m && VALIDO.test(m[1])) return m[1];
  }

  return null;
}

function youtubeEmbedUrl(url: string): string | null {
  const id = youtubeIdDaUrl(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

function vimeoEmbedUrl(url: string): string | null {
  // Vídeo NÃO LISTADO do Vimeo vem como `vimeo.com/123456789/abcdef123` — o
  // segundo segmento é a chave de acesso, e sem ela (`?h=`) o player devolve
  // "privado" mesmo com o link certo na mão.
  const naoListado = url.match(/vimeo\.com\/(\d+)\/(\w+)/);
  if (naoListado) return `https://player.vimeo.com/video/${naoListado[1]}?h=${naoListado[2]}`;

  const comHash = url.match(/player\.vimeo\.com\/video\/(\d+)\?h=(\w+)/);
  if (comHash) return `https://player.vimeo.com/video/${comHash[1]}?h=${comHash[2]}`;

  const padroes = [/vimeo\.com\/(\d+)/, /player\.vimeo\.com\/video\/(\d+)/];
  for (const padrao of padroes) {
    const m = url.match(padrao);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
}

/**
 * Vídeo hospedado no Google Drive — caminho comum aqui, porque a construtora
 * entrega o material numa pasta do Drive e é de lá que o corretor tira tudo
 * (o importador de fotos já lê Drive). O `/preview` é o player embutível;
 * o `/view` é a PÁGINA do Drive e, dentro de um iframe, o Google recusa
 * exibir.
 *
 * O host é comparado por IGUALDADE: `xdrive.google.com` termina com
 * `drive.google.com` e passaria numa checagem por sufixo.
 */
function driveEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "drive.google.com") return null;

  const m = parsed.pathname.match(/^\/file\/d\/([\w-]+)/);
  const id = m?.[1] ?? parsed.searchParams.get("id");
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/**
 * `null` quando `url` não é um link de YouTube/Vimeo reconhecível — nesse
 * caso o chamador cai pro `<video>` nativo, tratando `url` como um arquivo
 * (ex.: um mp4 subido direto no nosso Storage).
 */
export function videoEmbedUrl(url: string): string | null {
  return youtubeEmbedUrl(url) ?? vimeoEmbedUrl(url) ?? driveEmbedUrl(url);
}

/** Id do vídeo do YouTube, para thumbnail (`i.ytimg.com`) e facade leve. */
export function youtubeId(url: string): string | null {
  return youtubeIdDaUrl(url);
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
        erro:
          "Não reconheci este link de vídeo. Vale link do YouTube (watch, youtu.be, Shorts ou live), " +
          "do Vimeo, de um vídeo no Google Drive, ou de um arquivo .mp4/.webm/.mov. " +
          "Link de Instagram, TikTok ou Facebook não pode ser embutido no site.",
      };
    }
  }

  return { ok: true, url: limpa };
}
