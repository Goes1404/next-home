import * as cheerio from "cheerio";

/**
 * Lê a página de empreendimento de uma construtora — PURO: HTML + URL entram,
 * estrutura sai. Sem rede e sem IA, para toda a regra ter teste com HTML real
 * salvo (`__fixtures__`: Cyrela, EZTEC, Plano&Plano, Even).
 *
 * O que a medição de 25/09 ensinou e está codificado aqui:
 *
 * - As fotos NÃO estão no `src`. A Cyrela carrega tudo por `data-src`; quem
 *   lê só `src` acha UMA imagem numa página que tem 108.
 * - Site feito em Next.js (Even) e WordPress com construtor visual (EZTEC)
 *   guardam imagem e vídeo dentro de SCRIPT, em JSON, com a barra escapada
 *   (`https:\/\/…`). Por isso, além das tags, o HTML inteiro é varrido.
 * - O otimizador de imagem do Next embrulha a foto em
 *   `/_next/image?url=<original>&w=…`. O que interessa é a original.
 * - O alt e o nome do arquivo já dizem o que é planta ("Planta Tipo 80m²",
 *   `…_planta_tipo_…`). "Implantação" é o terreno visto de cima, NÃO planta
 *   de apartamento.
 * - A página traz lixo junto: logo, ícone, selo de privacidade, e às vezes os
 *   OUTROS empreendimentos da construtora ("recomendados"). O filtro tira o
 *   que é certo tirar; o resto vai para a grade e o corretor desmarca.
 */

export type ImagemDoSite = {
  url: string;
  /**
   * Vem marcada na grade. Só a foto que o próprio site DESCREVEU (tag com
   * alt) ou a planta: o que só aparece em script costuma ser outro
   * empreendimento da construtora ("recomendados"), e o corretor marca à mão.
   */
  sugerida: boolean;
  /** Texto alternativo ou o nome do arquivo legível — é o que a grade mostra. */
  legenda: string;
  parecePlanta: boolean;
};

export type MidiaDoSite = {
  tipo: "video" | "tour360";
  url: string;
  titulo: string;
};

export type DicasEstruturadas = {
  nome?: string;
  endereco?: string;
  cidade?: string;
  bairro?: string;
  lat?: number;
  lng?: number;
};

export type PaginaLida = {
  titulo: string;
  texto: string;
  imagens: ImagemDoSite[];
  midias: MidiaDoSite[];
  dicas: DicasEstruturadas;
  /** A página chegou quase vazia: é montada por JavaScript no navegador. */
  montadaPorJs: boolean;
};

/** Grade maior que isso não é curadoria, é trabalho braçal. */
export const TETO_IMAGENS_SITE = 60;

const MINIMO_DE_TEXTO = 400;

const EXTENSAO_IMAGEM = /\.(jpe?g|png|webp|avif)(?:$|[?#])/i;

/** Nome de arquivo que nunca é foto do imóvel. */
const LIXO =
  /(logo|icon|icone|favicon|sprite|selo|badge|avatar|placeholder|loading|spinner|whatsapp|facebook|instagram|youtube|linkedin|tiktok|twitter|pinterest|flag|bandeira|seta|arrow|close|menu|btn|botao|lupa|search|cookie|privacidade|dponet|google-play|app-store|qr-?code|default-facebook|og-default|maxresdefault|hqdefault|sddefault)/i;

/** Peça de layout do site, não foto do imóvel (fundo de rodapé, textura, arco). */
const PECA_DE_LAYOUT = /(^|[-_\s])(bg|footer|header|pattern|textura|texture|shape|arcs?|divisor|separador)([-_.\s]|$)/i;

/** Arquivo redimensionado pelo WordPress (`-300x200`) ou miniatura. */
const MINIATURA = /(-\d{2,4}x\d{2,4}|[-_](thumb|thumbnail|small|mini|tiny))(?=\.[a-z]+$)/i;

const PLANTA = /\bplanta\b|planta[_-]|[_-]planta|floor[\s_-]?plan/i;
const IMPLANTACAO = /implanta/i;

function desescapar(texto: string): string {
  return texto
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

/** Resolve relativa, desembrulha o otimizador e tira o fragmento. */
function normalizarUrl(bruta: string, base: string): string | null {
  const limpa = desescapar(bruta.trim()).replace(/^['"]|['"]$/g, "");
  if (!limpa || limpa.startsWith("data:") || limpa.startsWith("blob:")) return null;

  let url: URL;
  try {
    url = new URL(limpa, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // `/_next/image?url=…` e variantes (`/image?url=…`) guardam a original.
  const embrulhada = url.searchParams.get("url");
  if (embrulhada && /image/i.test(url.pathname)) {
    return normalizarUrl(embrulhada, base);
  }

  url.hash = "";

  // Drupal (Cyrela): `/sites/default/files/styles/<estilo>/public/x.jpg.webp`
  // é uma cópia reduzida de `/sites/default/files/x.jpg`. A original é maior.
  const drupal = url.pathname.match(/^(.*\/files)\/styles\/[^/]+\/public\/(.+?)(\.webp)?$/);
  if (drupal) {
    url.pathname = `${drupal[1]}/${drupal[2]}`;
    url.search = "";
  }

  return url.toString();
}

function nomeDoArquivo(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

/** "04_CYRFL_PH_98m2_TIPO_A.jpg" → "04 CYRFL PH 98m2 TIPO A". */
function legendaDoArquivo(url: string): string {
  return nomeDoArquivo(url)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de identidade da MESMA foto em tamanhos diferentes: sem o sufixo de
 * redimensionamento, sem query, sem caixa.
 *
 * É também o que se grava em `midias.origem_url` (0113): a próxima leitura da
 * página pode trazer a mesma foto em outro tamanho ou formato, e só a chave
 * reconhece que ela já foi trazida.
 */
export function chaveDaFoto(url: string): string {
  try {
    const u = new URL(url);
    const caminho = u.pathname
      .toLowerCase()
      .replace(MINIATURA, "")
      .replace(/@\dx(?=\.)/, "")
      // A mesma foto servida em formatos diferentes (Plano&Plano manda
      // `.webp` e `.png` do mesmo arquivo) é uma foto só.
      .replace(/\.(jpe?g|png|webp|avif)(\.(webp|avif))?$/, "");
    return `${u.hostname.replace(/^www\./, "")}${caminho}`;
  } catch {
    return url;
  }
}

/** Do `srcset`, a maior versão: é a foto que vale a pena trazer. */
function maiorDoSrcset(srcset: string): string | null {
  let melhor: { url: string; peso: number } | null = null;
  for (const item of srcset.split(/,\s+(?=\S)/)) {
    const [url, descritor = "1x"] = item.trim().split(/\s+/);
    if (!url) continue;
    const peso = parseFloat(descritor) * (descritor.endsWith("x") ? 1000 : 1);
    if (!melhor || peso > melhor.peso) melhor = { url, peso };
  }
  return melhor?.url ?? null;
}

function pareceLixo(url: string, larguraDeclarada?: number, alturaDeclarada?: number): boolean {
  const nome = nomeDoArquivo(url);
  if (!EXTENSAO_IMAGEM.test(url) && !/\.(jpe?g|png|webp|avif)$/i.test(nome)) return true;
  if (LIXO.test(nome) || PECA_DE_LAYOUT.test(nome)) return true;
  // Declarada pequena na própria tag: ícone ou miniatura, não foto.
  if ((larguraDeclarada && larguraDeclarada < 200) || (alturaDeclarada && alturaDeclarada < 150)) return true;
  return false;
}

function pareceFotoDePlanta(legenda: string, url: string): boolean {
  const alvo = `${legenda} ${nomeDoArquivo(url)}`;
  return PLANTA.test(alvo) && !IMPLANTACAO.test(alvo);
}

/** ID do YouTube (11 caracteres) em qualquer das formas que aparecem em página. */
const YOUTUBE =
  /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const VIMEO = /(?:player\.vimeo\.com\/video\/|vimeo\.com\/)(\d{6,12})/g;
const MATTERPORT = /my\.matterport\.com\/show\/?\?m=([A-Za-z0-9]{8,16})/g;
const KUULA = /kuula\.co\/(?:share|post)\/([A-Za-z0-9_\-/]{4,60})/g;

function lerMidias(html: string): MidiaDoSite[] {
  const cru = desescapar(html);
  const vistas = new Set<string>();
  const saida: MidiaDoSite[] = [];
  const adicionar = (tipo: MidiaDoSite["tipo"], url: string) => {
    if (vistas.has(url)) return;
    vistas.add(url);
    saida.push({ tipo, url, titulo: "" });
  };

  for (const m of cru.matchAll(MATTERPORT)) adicionar("tour360", `https://my.matterport.com/show/?m=${m[1]}`);
  for (const m of cru.matchAll(KUULA)) adicionar("tour360", `https://kuula.co/share/${m[1].replace(/\/+$/, "")}`);
  for (const m of cru.matchAll(YOUTUBE)) adicionar("video", `https://www.youtube.com/watch?v=${m[1]}`);
  for (const m of cru.matchAll(VIMEO)) adicionar("video", `https://vimeo.com/${m[1]}`);

  let v = 0;
  let t = 0;
  for (const midia of saida) {
    midia.titulo = midia.tipo === "video" ? `Vídeo ${++v}` : `Tour 360° ${++t}`;
  }
  return saida;
}

function numero(valor: unknown): number | undefined {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : typeof valor === "number" ? valor : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function textoCurto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() && valor.trim().length < 200 ? valor.trim() : undefined;
}

/**
 * Dados estruturados que a página publica para o Google (JSON-LD e `og:`).
 * Entram como DICA para a IA, nunca direto no cadastro: `og:region` da
 * Cyrela diz "Brooklin", e o bairro que a busca e o mapa usam é o que o
 * corretor escolhe.
 */
function lerDicas($: cheerio.CheerioAPI): DicasEstruturadas {
  const dicas: DicasEstruturadas = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    let dado: unknown;
    try {
      dado = JSON.parse($(el).text());
    } catch {
      return;
    }
    const fila: unknown[] = [dado];
    while (fila.length > 0) {
      const item = fila.shift();
      if (!item || typeof item !== "object") continue;
      if (Array.isArray(item)) {
        fila.push(...item);
        continue;
      }
      const obj = item as Record<string, unknown>;
      if (obj["@graph"]) fila.push(obj["@graph"]);

      const tipo = String(obj["@type"] ?? "");
      // Organization e WebSite descrevem a CONSTRUTORA, não o imóvel.
      if (/organization|website|webpage|breadcrumb/i.test(tipo)) continue;

      const endereco = obj.address as Record<string, unknown> | undefined;
      if (endereco && typeof endereco === "object") {
        dicas.endereco ??= textoCurto(endereco.streetAddress);
        dicas.cidade ??= textoCurto(endereco.addressLocality);
      }
      const geo = obj.geo as Record<string, unknown> | undefined;
      if (geo && typeof geo === "object") {
        dicas.lat ??= numero(geo.latitude);
        dicas.lng ??= numero(geo.longitude);
      }
      if (/residence|apartment|house|product|place|accommodation|realestate|singlefamily/i.test(tipo)) {
        dicas.nome ??= textoCurto(obj.name);
      }
    }
  });

  const meta = (propriedade: string) => textoCurto($(`meta[property="${propriedade}"]`).attr("content"));
  dicas.cidade ??= meta("og:locality");
  dicas.bairro ??= meta("og:region");

  const lat = numero($('meta[property="place:location:latitude"]').attr("content"));
  const lng = numero($('meta[property="place:location:longitude"]').attr("content"));
  if (lat !== undefined && lng !== undefined) {
    dicas.lat ??= lat;
    dicas.lng ??= lng;
  }

  return dicas;
}

export function lerPaginaDaConstrutora(html: string, urlDaPagina: string): PaginaLida {
  const $ = cheerio.load(html);

  const titulo = ($('meta[property="og:title"]').attr("content") || $("title").first().text() || "")
    .replace(/\s+/g, " ")
    .trim();
  const dicas = lerDicas($);
  const midias = lerMidias(html);

  // ─── Imagens ──────────────────────────────────────────────────────────
  // Três níveis de confiança, nessa ordem na grade: tag com alt (quem
  // escreveu o site descreveu a foto), tag sem alt, e o que só aparece em
  // script. Dentro de cada nível, a ordem da página.
  type Candidata = { url: string; legenda: string; nivel: number; ordem: number; naSecaoDePlantas?: boolean };
  const candidatas: Candidata[] = [];
  let ordem = 0;
  const propor = (
    bruta: string | undefined | null,
    legenda: string,
    nivel: number,
    w?: number,
    h?: number,
    naSecaoDePlantas = false,
  ) => {
    if (!bruta) return;
    const url = normalizarUrl(bruta, urlDaPagina);
    if (!url || pareceLixo(url, w, h)) return;
    const texto = legenda.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    // "Selo", "Logo Cyrela": o alt diz o que o nome do arquivo não disse.
    if (/^(selo|logo|logotipo|ícone|icone)\b/i.test(texto)) return;
    candidatas.push({ url, legenda: texto, nivel, ordem: ordem++, naSecaoDePlantas });
  };

  $("img, source").each((_, el) => {
    const $el = $(el);
    const alt = ($el.attr("alt") || $el.attr("title") || $el.closest("picture").find("img").attr("alt") || "").trim();
    const w = numero($el.attr("width"));
    const h = numero($el.attr("height"));
    const nivel = alt ? 0 : 1;
    // A Plano&Plano não descreve a planta no alt: ela mora numa aba com
    // `id="modals-plants-…"`. A seção diz o que a foto é.
    const secao = $el
      .parents()
      .toArray()
      .some((p) => /plant|floor-?plan/i.test(`${$(p).attr("id") ?? ""} ${$(p).attr("class") ?? ""}`));
    const srcset = $el.attr("data-srcset") || $el.attr("srcset");
    if (srcset) propor(maiorDoSrcset(srcset), alt, nivel, w, h, secao);
    for (const attr of ["data-src", "data-lazy-src", "data-original", "data-full", "data-large", "src"]) {
      propor($el.attr(attr), alt, nivel, w, h, secao);
    }
  });

  // Galerias costumam apontar a foto grande num link em volta da miniatura.
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (EXTENSAO_IMAGEM.test(href)) propor(href, ($(el).attr("title") || $(el).find("img").attr("alt") || "").trim(), 0);
  });

  $("[style*='background']").each((_, el) => {
    const estilo = $(el).attr("style") ?? "";
    for (const m of estilo.matchAll(/url\(([^)]+)\)/g)) propor(m[1], "", 1);
  });

  propor($('meta[property="og:image"]').attr("content"), $('meta[property="og:image:alt"]').attr("content") ?? "", 1);

  const cru = desescapar(html);
  for (const m of cru.matchAll(/https?:\/\/[^\s"'<>()\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>()\\]*)?/gi)) {
    propor(m[0], "", 2);
  }

  const porChave = new Map<string, Candidata>();
  for (const c of candidatas) {
    const chave = chaveDaFoto(c.url);
    const ja = porChave.get(chave);
    if (!ja) {
      porChave.set(chave, c);
      continue;
    }
    // A mesma foto vista duas vezes: fica o melhor nível, a legenda que
    // existir, e a URL SEM sufixo de miniatura (a maior).
    const melhor = c.nivel < ja.nivel ? c : ja;
    porChave.set(chave, {
      ...melhor,
      legenda: melhor.legenda || c.legenda || ja.legenda,
      naSecaoDePlantas: c.naSecaoDePlantas || ja.naSecaoDePlantas,
      url: MINIATURA.test(nomeDoArquivo(melhor.url)) && !MINIATURA.test(nomeDoArquivo(c.url)) ? c.url : melhor.url,
      ordem: Math.min(c.ordem, ja.ordem),
    });
  }

  // O endereço da página costuma trazer o nome do empreendimento
  // (`/imoveis/gran-resort-reserva-sao-caetano`), e a EZTEC nomeia as fotos
  // do mesmo jeito (`gran_resort_scs_fachada.jpg`). Foto cujo nome repete um
  // pedaço do endereço é deste empreendimento, mesmo sem alt.
  const GENERICAS = /^(imoveis|imovel|empreendimentos?|residencial|apartamentos?|lancamentos?|sao|paulo|barueri|zona|oeste|leste|norte|sul|venda|casas?)$/;
  // Contam as DUAS primeiras palavras do último trecho do endereço, juntas:
  // são elas que distinguem o empreendimento. Uma só não basta ("gran" casa
  // com o Gran Maia, outro prédio da EZTEC), e as seguintes costumam ser
  // bairro — os "recomendados" são do mesmo bairro
  // (`reserva_sao_caetano_bosque_recomendado.jpg`).
  const nomeNoEndereco = (() => {
    try {
      const segmentos = new URL(urlDaPagina).pathname.split("/").filter(Boolean);
      const palavras = (segmentos.at(-1) ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !GENERICAS.test(t));
      const juntas = palavras.slice(0, 2).join("");
      return juntas.length >= 6 ? juntas : undefined;
    } catch {
      return undefined;
    }
  })();
  const repeteONome = (url: string) =>
    nomeNoEndereco !== undefined &&
    nomeDoArquivo(url).toLowerCase().replace(/[^a-z0-9]+/g, "").includes(nomeNoEndereco);

  const imagens: ImagemDoSite[] = [...porChave.values()]
    .sort((a, b) => a.nivel - b.nivel || a.ordem - b.ordem)
    .slice(0, TETO_IMAGENS_SITE)
    .map((c) => {
      const legenda = c.legenda || legendaDoArquivo(c.url);
      const parecePlanta = Boolean(c.naSecaoDePlantas) || pareceFotoDePlanta(legenda, c.url);
      return { url: c.url, legenda, parecePlanta, sugerida: c.nivel === 0 || parecePlanta || repeteONome(c.url) };
    });

  // ─── Texto ────────────────────────────────────────────────────────────
  // Menu, cabeçalho e rodapé repetem em toda página do site e só atrapalham
  // a leitura: é deles que viria "+27 mil lares entregues" como se fosse
  // deste prédio.
  $("script, style, noscript, svg, iframe, template, nav, header, footer, form, [aria-hidden='true']").remove();
  const raiz = $("main").length ? $("main") : $("body");
  const blocos: string[] = [];
  raiz.find("h1, h2, h3, h4, p, li, td, th, dt, dd, span, div, a, strong, figcaption").each((_, el) => {
    const $el = $(el);
    // Só folhas de texto: sem isso, cada frase aparece uma vez por ancestral.
    if ($el.children().length > 0 && $el.children().text().trim() === $el.text().trim()) return;
    const t = $el.contents().filter((_i, n) => n.type === "text").text().replace(/\s+/g, " ").trim();
    if (t.length > 1) blocos.push(t);
  });
  const texto = blocos
    .filter((b, i) => blocos.indexOf(b) === i)
    .join("\n")
    .trim();

  const montadaPorJs = texto.length < MINIMO_DE_TEXTO && imagens.length < 3;

  return { titulo, texto, imagens, midias, dicas, montadaPorJs };
}
