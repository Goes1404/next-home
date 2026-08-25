"use client";

import Image from "next/image";
import { useRef, ViewTransition } from "react";
import { useCamada } from "@/components/motion/Camada";
import type { Midia } from "@/lib/types";

/**
 * A capa do hero em três planos.
 *
 * Ela já era `fixed inset-0`, o que dá parallax "de graça" — a página
 * desliza por cima de uma foto parada. O que faltava era a foto REAGIR:
 * aqui ela amplia até 12% conforme o scroll avança, e um segundo véu fecha
 * junto, escurecendo a imagem à medida que o conteúdo opaco sobe. Sem esse
 * véu progressivo, a passagem do hero para a primeira banda opaca é um
 * corte seco.
 *
 * O MEDIDOR existe porque elemento `fixed` NÃO SERVE de referência de
 * scroll: o retângulo dele é sempre a viewport inteira, então o progresso
 * dá zero para sempre e nada se move. Quem se registra na camada é um
 * irmão `absolute inset-0` — que rola junto com a seção do hero — e ele
 * conduz a foto e o véu pelo `aoAtualizar`.
 */
export function CapaHero({ slug, capa }: { slug: string; capa: Midia }) {
  const medidor = useRef<HTMLSpanElement>(null);
  const foto = useRef<HTMLDivElement>(null);
  const veu = useRef<HTMLDivElement>(null);

  useCamada(medidor, {
    // O medidor não se move: ele só informa o progresso. Daí velocidade 0.
    velocidade: 0,
    aoAtualizar: (progresso, fator) => {
      // Só a metade positiva é percorrida na prática: o hero nasce colado no
      // topo da tela, então o progresso vai de 0 (topo da página) a 1 (hero
      // saindo por cima).
      const p = Math.max(0, Math.min(1, progresso));

      const el = foto.current;
      if (el) {
        // O fator entra aqui à mão porque quem escreve é este callback, não o
        // controlador: sem ele o celular rodaria a intensidade cheia.
        const y = p * 0.08 * fator * window.innerHeight;
        el.style.transform = `translate3d(0, ${y}px, 0) scale(${1 + p * 0.12 * fator})`;
      }

      // O véu NÃO leva fator: ele não é movimento, é a transição que evita o
      // corte seco entre o hero e a primeira banda opaca — e continua valendo
      // com movimento reduzido.
      const sombra = veu.current;
      if (sombra) sombra.style.opacity = String(p);
    },
  });

  return (
    <>
      {/* Medidor: rola com a seção do hero (que é `relative`) e serve de
          referência de progresso. Invisível e fora do fluxo. */}
      <span ref={medidor} aria-hidden className="pointer-events-none absolute inset-0" />

      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div ref={foto} className="absolute inset-0 will-change-transform">
          <ViewTransition name={`capa-${slug}`}>
            <Image
              src={capa.url}
              alt={capa.alt}
              fill
              priority
              sizes="100vw"
              placeholder={capa.blurDataUrl ? "blur" : "empty"}
              blurDataURL={capa.blurDataUrl ?? undefined}
              className="object-cover"
            />
          </ViewTransition>
        </div>

        {/* Cor literal de propósito: este véu escurece a FOTO de capa para o
            texto branco por cima ficar legível. O fundo dele é a imagem, não
            a página — num tema claro ele continua escuro, senão o texto
            some. */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/15 to-ink-950" />

        {/* Segundo véu, este comandado pelo scroll: fecha a foto conforme o
            conteúdo opaco sobe. */}
        <div ref={veu} data-veu-scroll className="absolute inset-0 bg-ink-950 opacity-0" />
      </div>
    </>
  );
}
