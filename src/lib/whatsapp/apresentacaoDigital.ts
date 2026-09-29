import type { Empreendimento } from "@/lib/types";
import { site } from "@/lib/site";
import { linkDaPagina, type PedidoMidia } from "./resolverMidia";

/**
 * A apresentação digital é o LINK da página do imóvel, nunca uma foto
 * (28/09/2026).
 *
 * Relatado: "quando a IA for mandar a apresentação, ela tem que mandar o
 * link do imóvel, não uma foto". A regra 17 do prompt mandava "o link junto
 * com uma ou duas fotos", e o modelo ficava com a metade mais fácil: pedia
 * as fotos em `anexosMidia` e esquecia o link, que ele teria de copiar da
 * ficha. O cliente pedia a apresentação e recebia uma foto solta.
 *
 * A regra mudou no prompt, mas prompt é probabilístico. Aqui é o código que
 * garante as duas metades, como já faz com o link do catálogo:
 *   1. quando o cliente pede a apresentação, ou a resposta diz que está
 *      mandando a apresentação, as FOTOS pedidas saem (planta, vídeo e tour
 *      ficam: são pedidos específicos, não "a apresentação");
 *   2. o link da página entra no texto, montado a partir do slug. A IA
 *      nunca escreve o endereço: link errado leva o cliente a um 404 com a
 *      marca da imobiliária em cima.
 *
 * Sem saber de QUAL imóvel é a apresentação, nada muda. Chutar o imóvel
 * mandaria o link errado, e a IA provavelmente está perguntando qual é.
 *
 * Módulo puro: sem rede e sem banco, para o teste exercitar o que roda.
 */

/** O cliente pediu a apresentação (as palavras são as da regra 17). */
const PEDIDO_DO_CLIENTE =
  /\b(apresenta[cç][aã]o|apresenta[cç][oõ]es|material(?!\s+d[aeo]\s)|book|folder|mais informa[cç][oõ]es)\b/i;

/** A resposta está entregando a apresentação. */
const ANUNCIO_NA_RESPOSTA = /\bapresenta[cç][aã]o\b/i;

/**
 * Frase que anuncia foto sendo enviada ("te mandei as fotos aqui embaixo").
 * Com as fotos retiradas, ela prometeria um anexo que não chega.
 */
const ANUNCIA_FOTO =
  /\bfotos?\b[^.!?\n]*\b(mand|envi|segu|embaixo|abaixo|aqui)|\b(mand|envi|segu)\w*\b[^.!?\n]*\bfotos?\b/i;

export type DecisaoApresentacao = {
  /** Imóvel da apresentação; `null` = nada a fazer. */
  slug: string | null;
  /** Os pedidos de mídia sem as fotos, quando a apresentação vale. */
  pedidos: PedidoMidia[];
  /** O texto sem as frases que anunciam foto, se as fotos saíram. */
  texto: string;
  tirouFotos: boolean;
};

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Link de página de imóvel já escrito no texto, qualquer slug. */
function linksDePagina(texto: string): { inteiro: string; slug: string }[] {
  const re = new RegExp(`${escapar(site.url)}/empreendimentos/([\\w-]+)`, "gi");
  return [...texto.matchAll(re)].map((m) => ({ inteiro: m[0], slug: m[1] }));
}

/** De qual imóvel é a apresentação. `null` quando não dá para saber. */
function imovelDaApresentacao(
  texto: string,
  pedidos: PedidoMidia[],
  recomendados: { slug?: string | null }[],
  catalogo: Empreendimento[],
): string | null {
  const existe = (slug?: string | null) => !!slug && catalogo.some((e) => e.slug === slug);

  const noTexto = linksDePagina(texto).find((l) => existe(l.slug));
  if (noTexto) return noTexto.slug;

  const daFoto = pedidos.find((p) => p?.tipo === "foto" && existe(p.slug));
  if (daFoto) return daFoto.slug;

  const qualquerMidia = pedidos.find((p) => existe(p?.slug));
  if (qualquerMidia) return qualquerMidia.slug;

  const recomendado = recomendados.find((r) => existe(r?.slug));
  if (recomendado?.slug) return recomendado.slug;

  return catalogo.length === 1 ? catalogo[0].slug : null;
}

function semFrasesDeFoto(texto: string): string {
  const frases = texto.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [texto];
  return frases
    // Frase que fala do link ou da página fica, mesmo citando fotos
    // ("o link tem todas as fotos"): é ela que apresenta o link.
    .filter((f) => !ANUNCIA_FOTO.test(f) || /\b(link|p[aá]gina|site)\b/i.test(f))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Primeira metade, ANTES de resolver os anexos: decide se a resposta está
 * entregando a apresentação, de qual imóvel, e tira as fotos pedidas.
 */
export function decidirApresentacao(entrada: {
  texto: string;
  pedidos: PedidoMidia[];
  recomendados?: { slug?: string | null }[];
  catalogo: Empreendimento[];
  /** O que o cliente acabou de escrever (os balões da vez, juntos). */
  falaDoCliente?: string | null;
}): DecisaoApresentacao {
  const { texto, catalogo } = entrada;
  const pedidos = entrada.pedidos ?? [];
  const nada = { slug: null, pedidos, texto, tirouFotos: false };

  const pediu = PEDIDO_DO_CLIENTE.test(entrada.falaDoCliente ?? "");
  const anunciou = ANUNCIO_NA_RESPOSTA.test(texto);
  if (!pediu && !anunciou) return nada;

  const slug = imovelDaApresentacao(texto, pedidos, entrada.recomendados ?? [], catalogo);
  if (!slug) return nada;

  const semFotos = pedidos.filter((p) => p?.tipo !== "foto");
  const tirouFotos = semFotos.length !== pedidos.length;
  return { slug, pedidos: semFotos, texto: tirouFotos ? semFrasesDeFoto(texto) : texto, tirouFotos };
}

/**
 * Segunda metade, POR ÚLTIMO (depois dos filtros de valor e de repetição,
 * para o link não ser cortado): garante o link da página no texto. Link de
 * página com slug que não existe vira o certo.
 */
export function garantirLinkDaPagina(
  texto: string,
  slug: string,
  catalogo: Empreendimento[],
): { texto: string; anexou: boolean } {
  const certo = linkDaPagina(slug);
  let novo = texto;
  for (const l of linksDePagina(novo)) {
    if (!catalogo.some((e) => e.slug === l.slug)) novo = novo.split(l.inteiro).join(certo);
  }
  if (novo.includes(certo)) return { texto: novo, anexou: novo !== texto };
  return { texto: novo.trim() ? `${novo.trim()} --- ${certo}` : certo, anexou: true };
}
