"use client";

import Image from "next/image";
import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Lightbox } from "@/components/ui/Lightbox";
import { areaM2, precoBRL, precoPorM2 } from "@/lib/format";
import type { Midia, Tipologia } from "@/lib/types";

const CAMPOS: Array<{ chave: keyof Tipologia; label: (t: Tipologia) => string }> = [
  { chave: "dormitorios", label: (t) => `${t.dormitorios} dorm.` },
  { chave: "suites", label: (t) => (t.suites > 0 ? `${t.suites} suíte${t.suites > 1 ? "s" : ""}` : "—") },
  { chave: "banheiros", label: (t) => `${t.banheiros} banh.` },
  { chave: "vagas", label: (t) => `${t.vagas} vaga${t.vagas > 1 ? "s" : ""}` },
];

/** Poucas unidades restantes é o único caso em que o aviso agrega urgência real. */
const LIMIAR_POUCAS_UNIDADES = 10;

export function Tipologias({
  tipologias,
  plantasGerais = [],
}: {
  tipologias: Tipologia[];
  /** Plantas cadastradas no empreendimento (não atreladas a uma tipologia). */
  plantasGerais?: Midia[];
}) {
  const [aberta, setAberta] = useState<number | null>(null);

  if (tipologias.length === 0) return null;

  // Um único conjunto para o lightbox, para dar pra navegar entre todas as
  // plantas sem fechar e reabrir.
  const plantas: Midia[] = [
    ...tipologias
      .filter((t) => t.plantaUrl)
      .map((t) => ({
        tipo: "planta" as const,
        url: t.plantaUrl!,
        alt: `Planta — ${t.nome}`,
        largura: 0,
        altura: 0,
        blurDataUrl: null,
      })),
    ...plantasGerais,
  ];

  const indiceDaPlanta = (t: Tipologia) => plantas.findIndex((p) => p.url === t.plantaUrl);

  return (
    <section id="tipologias" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Tipologias</h2>
        <p className="text-fluid-base mt-2 text-mist-300">
          Metragens e valores por unidade — sujeitos a disponibilidade.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {tipologias.map((t, i) => {
          const porM2 = precoPorM2(t.preco, t.areaPrivativa);
          const poucas =
            t.unidadesDisponiveis !== null &&
            t.unidadesDisponiveis > 0 &&
            t.unidadesDisponiveis <= LIMIAR_POUCAS_UNIDADES;

          return (
            <Reveal key={t.nome} delay={i * 0.08} from="baixo">
              <article className="flex h-full flex-col rounded-2xl border border-white/10 bg-ink-900 px-6 py-6">
                <h3 className="font-display text-lg text-mist-50">{t.nome}</h3>
                <p className="text-fluid-sm mt-1 text-mist-400">
                  {areaM2(t.areaPrivativa)} privativos
                </p>

                {t.plantaUrl && (
                  <button
                    type="button"
                    onClick={() => setAberta(indiceDaPlanta(t))}
                    aria-label={`Ver planta de ${t.nome}`}
                    className="group relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
                  >
                    <Image
                      src={t.plantaUrl}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 340px, 100vw"
                      className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="text-fluid-xs absolute right-2 bottom-2 rounded-full bg-ink-950/80 px-2.5 py-1 text-mist-200">
                      Ver planta
                    </span>
                  </button>
                )}

                <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/10 pt-4 text-center">
                  {CAMPOS.map((campo) => (
                    <p key={campo.chave} className="text-fluid-sm font-medium text-mist-100">
                      {campo.label(t)}
                    </p>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-fluid-lg font-medium text-brand-200">{precoBRL(t.preco)}</p>
                  {porM2 && <p className="text-fluid-xs text-mist-400">{porM2}</p>}
                </div>

                {poucas && (
                  <p className="text-fluid-xs mt-3 inline-flex items-center gap-1.5 text-sand-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-sand-400" />
                    {t.unidadesDisponiveis === 1
                      ? "Última unidade disponível"
                      : `${t.unidadesDisponiveis} unidades disponíveis`}
                  </p>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>

      <Lightbox
        itens={plantas}
        indice={aberta}
        aoFechar={() => setAberta(null)}
        aoTrocar={setAberta}
        rotulo="Plantas"
      />
    </section>
  );
}
