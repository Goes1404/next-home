import Image from "next/image";
import Link from "next/link";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";
import { Camada } from "@/components/motion/Camada";

import { srcDaMidia } from "@/lib/imagens/variantes";
/*
 * Profundidade de cada card (03/10/2026). Os dois menores ficam "mais perto":
 * andam mais com a rolagem e com o ponteiro, e o grande, mais devagar, fica
 * atrás. A rolagem vai na `Camada` (transform); o ponteiro vai no `Link`, pela
 * propriedade `translate`, lendo as variáveis que `ProfundidadeDoPonteiro`
 * escreve na seção. Duas propriedades, dois donos, sem briga.
 */
const PROFUNDIDADE = [
  { rolagem: -0.04, ponteiro: "[translate:calc(var(--ponteiro-x,0)*8px)_calc(var(--ponteiro-y,0)*6px)]" },
  { rolagem: -0.16, ponteiro: "[translate:calc(var(--ponteiro-x,0)*18px)_calc(var(--ponteiro-y,0)*14px)]" },
  { rolagem: -0.1, ponteiro: "[translate:calc(var(--ponteiro-x,0)*13px)_calc(var(--ponteiro-y,0)*10px)]" },
] as const;

/**
 * A coluna da direita do herói, SÓ no computador (30/09/2026).
 *
 * Até aqui o herói do computador era um texto centrado sobre verde liso:
 * sem vídeo desde 13/09 (o quadro parado do logotipo lia como imagem
 * aleatória), sobrava uma tela inteira sem uma foto sequer — numa
 * imobiliária, onde o produto É a foto. O mosaico usa três capas REAIS dos
 * destaques, e cada uma leva ao imóvel.
 *
 * Carregamento: `hidden lg:grid`. No celular a coluna não existe, e o
 * `sizes` diz "1px" abaixo de 1024px, então mesmo a primeira foto, que é
 * `eager` (ela é a candidata a LCP no computador), baixa a menor variante
 * do srcset em vez de uma foto inteira que ninguém vê. Sem `priority`: ele
 * emite um `<link rel=preload>` sem mídia, e o celular pagaria a foto cheia.
 */
export function MosaicoDoHeroi({ imoveis }: { imoveis: Empreendimento[] }) {
  const fotos = imoveis.filter((e) => e.galeria.length > 0).slice(0, 3);
  if (fotos.length < 3) return null;

  return (
    <div className="hidden h-[clamp(320px,calc(100svh_-_12.5rem),660px)] w-full grid-cols-5 grid-rows-2 gap-3 lg:grid">
      {fotos.map((e, i) => (
        <Camada
          key={e.slug}
          velocidade={PROFUNDIDADE[i].rolagem}
          className={i === 0 ? "col-span-3 row-span-2" : "col-span-2"}
        >
        <Link
          href={`/empreendimentos/${e.slug}`}
          prefetch={false}
          className={
            PROFUNDIDADE[i].ponteiro +
            " group relative block h-full overflow-hidden rounded-[1.75rem] shadow-xl ring-1 ring-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
          }
        >
          <Image
            src={srcDaMidia(e.capa)}
            alt={e.capa.alt}
            fill
            sizes={i === 0 ? "(min-width: 1024px) 34vw, 1px" : "(min-width: 1024px) 22vw, 1px"}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : undefined}
            placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
            blurDataURL={e.capa.blurDataUrl ?? undefined}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          {/* Véu só na base, em preto literal: o texto flutua sobre a FOTO,
              e token de tema aqui sumiria no claro (a lição do selo). */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
          />
          <span className="absolute inset-x-0 bottom-0 p-4 text-white">
            <span className="block text-[11px] font-medium tracking-[0.14em] text-brand-200 uppercase">
              {STATUS_LABEL[e.status]}
            </span>
            <span className={"font-display block leading-tight " + (i === 0 ? "text-2xl" : "text-lg")}>
              {e.nome}
            </span>
            <span className="block text-sm text-white/80">
              {[e.bairro, e.cidade].filter(Boolean).join(", ")}
            </span>
          </span>
        </Link>
        </Camada>
      ))}
    </div>
  );
}

/**
 * Os mesmos destaques do mosaico, NO CELULAR (26/10/2026, Aretz: "não está
 * aparecendo os cards iniciais dos prédios"). O mosaico é `hidden lg:grid`;
 * aqui as capas viram uma faixa que desliza de lado, com encaixe, logo abaixo
 * da busca. `lg:hidden`, então o computador continua só com o mosaico.
 *
 * Só nos sites de outros grupos por enquanto (quem chama decide): a home da
 * Next Home fica como está.
 *
 * `sizes` cobre só o celular (a faixa não existe a partir de 1024px) e todas
 * as fotos são `lazy` — o herói do celular não tem foto candidata a LCP.
 */
export function FaixaDoHeroiNoCelular({ imoveis }: { imoveis: Empreendimento[] }) {
  const fotos = imoveis.filter((e) => e.galeria.length > 0).slice(0, 6);
  if (fotos.length === 0) return null;

  return (
    <div className="-mx-4 mt-6 w-[calc(100%+2rem)] sm:-mx-8 sm:w-[calc(100%+4rem)] lg:hidden">
      <ul
        aria-label="Imóveis em destaque"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-2 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {fotos.map((e) => (
          <li key={e.slug} className="w-[78%] max-w-[22rem] shrink-0 snap-start sm:w-[46%]">
            <Link
              href={`/empreendimentos/${e.slug}`}
              prefetch={false}
              className="group relative block aspect-[4/5] overflow-hidden rounded-[1.5rem] shadow-xl ring-1 ring-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
            >
              <Image
                src={srcDaMidia(e.capa)}
                alt={e.capa.alt}
                fill
                sizes="(min-width: 1024px) 1px, (min-width: 640px) 46vw, 78vw"
                loading="lazy"
                placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
                blurDataURL={e.capa.blurDataUrl ?? undefined}
                className="object-cover"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 p-4 text-left text-white">
                <span className="block text-[11px] font-medium tracking-[0.14em] text-brand-200 uppercase">
                  {STATUS_LABEL[e.status]}
                </span>
                <span className="font-display block text-xl leading-tight">{e.nome}</span>
                <span className="block text-sm text-white/80">
                  {[e.bairro, e.cidade].filter(Boolean).join(", ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
