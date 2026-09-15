import type { Empreendimento, Midia, StatusObra, TipoImovel } from "@/lib/types";

/**
 * O que o globo e o mapa PRECISAM de um imóvel — e nada mais.
 *
 * Até a F3 do roadmap de performance (13/09/2026) a home passava o catálogo
 * inteiro para `GloboOuMapa`, um client component: 25 imóveis com galeria,
 * descrição, lazer, tipologias e 335 `blurDataUrl` em base64 serializados no
 * HTML — 252 KB de RSC (86 KB gzip na home toda) para desenhar 25 pontos e,
 * ao toque, um cartão com foto, nome, bairro, estágio e preço. Este tipo é o
 * contrato mínimo: o que `CardFlutuanteImovel` e `MapaInterativoClient`
 * leem, medido no código.
 *
 * Os nomes dos campos são os de `Empreendimento`, de propósito: um
 * `Empreendimento` continua sendo um `PontoDoMapa` válido para o TypeScript,
 * então nenhum chamador quebra — só deixa de mandar o que não usa.
 */
export type PontoDoMapa = {
  slug: string;
  nome: string;
  bairro: string;
  cidade: string;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  status: StatusObra;
  tipo: TipoImovel;
  precoAPartir: number | null;
  capa: Pick<Midia, "url" | "alt" | "blurDataUrl">;
  corretor: { whatsapp: string } | null;
};

export function pontoDoMapa(e: Empreendimento): PontoDoMapa {
  return {
    slug: e.slug,
    nome: e.nome,
    bairro: e.bairro,
    cidade: e.cidade,
    endereco: e.endereco,
    lat: e.lat,
    lng: e.lng,
    status: e.status,
    tipo: e.tipo,
    precoAPartir: e.precoAPartir,
    capa: { url: e.capa.url, alt: e.capa.alt, blurDataUrl: e.capa.blurDataUrl },
    corretor: e.corretor ? { whatsapp: e.corretor.whatsapp } : null,
  };
}

export function pontosDoMapa(lista: Empreendimento[]): PontoDoMapa[] {
  return lista.map(pontoDoMapa);
}
