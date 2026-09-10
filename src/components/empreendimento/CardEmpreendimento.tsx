import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { BrilhoCarro } from "@/components/motion/BrilhoCarro";
import { Camada } from "@/components/motion/Camada";
import { ehRecente, precoAPartirDe } from "@/lib/format";
import { resumoTipologias } from "@/lib/resumoTipologias";
import { STATUS_PONTO, STATUS_TINTA } from "@/lib/statusCor";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";

/**
 * Card de empreendimento, usado na listagem e na régua de similares.
 *
 * Mesmo vidro (`preset="card"`, CSS-only — ver GlassSurface.tsx) dos cards
 * de destaque na home, para o efeito ficar consistente em todo lugar onde
 * um empreendimento aparece em miniatura.
 *
 * A capa entra num `<ViewTransition>` cujo nome é o slug: o hero da página
 * de detalhe usa o mesmo nome, então o navegador interpola a foto do card
 * até a posição do hero em vez de trocar as duas páginas secamente.
 */
export function CardEmpreendimento({
  empreendimento: e,
  prioridade = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  aspecto = "aspect-[4/3]",
  velocidadeCapa = 0.12,
}: {
  empreendimento: Empreendimento;
  /** `priority` na imagem — só para os primeiros cards acima da dobra. */
  prioridade?: boolean;
  sizes?: string;
  /** Proporção da capa — o card-destaque da listagem usa uma mais panorâmica. */
  aspecto?: string;
  /**
   * Velocidade da capa dentro da moldura. As grades escalonam por COLUNA —
   * é a diferença entre colunas vizinhas que se lê como mosaico vivo; todas
   * no mesmo ritmo pareceria a página inteira tremendo junto.
   */
  velocidadeCapa?: number;
}) {
  const ficha = resumoTipologias(e.tipologias);

  return (
    <Link
      href={`/empreendimentos/${e.slug}`}
      className="block rounded-glass focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
    >
      <GlassSurface
        preset="card"
        className="group overflow-hidden transition-transform duration-500 ease-out hover:-translate-y-1.5"
      >
        <div className={`relative ${aspecto} w-full overflow-hidden rounded-t-[calc(var(--radius-glass)-1px)]`}>
          {/* `scale-110` na camada: sem a folga, o deslocamento exporia borda
              vazia no alto ou embaixo da moldura. Mesma razão do
              ParallaxImagem. */}
          <Camada velocidade={velocidadeCapa} className="absolute inset-0 scale-110">
            <ViewTransition name={`capa-${e.slug}`}>
              <Image
                src={e.capa.url}
                alt={e.capa.alt}
                fill
                sizes={sizes}
                priority={prioridade}
                placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
                blurDataURL={e.capa.blurDataUrl ?? undefined}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            </ViewTransition>
          </Camada>

          {/* Cor literal nas DUAS pontas: o selo flutua sobre a capa, e o que
              precisa contrastar com ele é a foto — não a superfície da
              página. Token de tema aqui é o defeito que a guarda
              `naoCortaTexto` persegue: `text-acento-suave` no tema CLARO é
              verde-escuro sobre o fundo escuro fixo do selo, e "Pronto para
              morar" sumia (visto na captura de /regioes em 10/09/2026).

              A tinta agora vem do ESTÁGIO (`statusCor.ts`): azul da marca
              para o que ainda vai sair, verde para o que está pronto, areia
              para as últimas unidades. É a cor mais repetida do site, e ela
              informa em vez de decorar. */}
          <span
            className={`text-fluid-xs absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink-950/80 px-3 py-1 font-medium tracking-wide uppercase backdrop-blur-sm ${STATUS_TINTA[e.status]}`}
          >
            <span aria-hidden className={`size-1.5 rounded-full ${STATUS_PONTO[e.status]}`} />
            {STATUS_LABEL[e.status]}
          </span>

          {ehRecente(e.criadoEm) && (
            // `text-ink-950` literal: o contraste aqui é com o próprio chip
            // de areia, que é claro nos dois temas.
            <span className="text-fluid-xs absolute top-3 right-3 rounded-full bg-sand-400/90 px-2.5 py-1 font-medium text-ink-950">
              Novo
            </span>
          )}
        </div>

        {/* O reflexo cobre o card INTEIRO, não só a capa: o que brilha é a
            superfície de vidro, e um brilho que morre na borda da foto
            denunciaria que são duas peças coladas. */}
        <BrilhoCarro />

        <div className="px-5 py-4">
          <h3 className="font-display text-lg text-titulo">
            <span className="bg-gradient-to-r from-acento-forte to-acento-forte bg-[length:0%_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-500 group-hover:bg-[length:100%_1px]">
              {e.nome}
            </span>
          </h3>
          <p className="text-fluid-sm mt-0.5 text-legenda">
            {e.bairro}, {e.cidade}
          </p>

          {/*
            A ficha curta — "2 e 3 dorms · 55–78 m²". O dado já vinha na
            consulta da listagem e não era mostrado: sem ele, comparar dois
            imóveis exigia abrir e voltar em cada um. Ver `resumoTipologias`
            para as regras (dois valores são listados, três ou mais viram
            faixa, ausência é silêncio).
          */}
          {ficha && (
            <p className="text-fluid-xs text-apoio mt-2 tabular-nums">{ficha}</p>
          )}

          {/*
            O preço fecha o cartão, separado por um fio: é o número que
            decide se a pessoa abre a ficha, e ele estava com o mesmo peso
            do endereço logo acima.
          */}
          <p className="border-linha/60 text-fluid-base text-acento-suave mt-3 border-t pt-3 font-semibold">
            {precoAPartirDe(e.precoAPartir)}
          </p>
        </div>
      </GlassSurface>
    </Link>
  );
}
