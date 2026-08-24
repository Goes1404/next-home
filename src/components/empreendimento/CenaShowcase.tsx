"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Camada } from "@/components/motion/Camada";
import { Reveal } from "@/components/motion/Reveal";
import type { Empreendimento, Midia } from "@/lib/types";

type Cena = { foto: Midia; frase: string; rotulo: string };

/**
 * As frases saem do que o imóvel TEM cadastrado — nada inventado. Cada uma
 * ganha a foto seguinte da galeria (a capa já dominou o hero).
 */
function cenasDe(e: Empreendimento): Cena[] {
  const fotos = e.galeria.filter((f) => f.url !== e.capa.url).slice(0, 3);
  if (fotos.length < 3) return [];

  const frases: Array<{ frase: string; rotulo: string }> = [
    { frase: e.tagline, rotulo: "O projeto" },
  ];

  if (e.lazer.length >= 3) {
    frases.push({
      frase: `${e.lazer.slice(0, 3).join(", ")} — e mais ${Math.max(e.lazer.length - 3, 0) || "outros"} itens de lazer.`,
      rotulo: "Viver bem",
    });
  } else {
    frases.push({ frase: `${e.bairro}, ${e.cidade}.`, rotulo: "O endereço" });
  }

  frases.push({
    frase: e.construtora ? `Assinado por ${e.construtora}.` : `${e.bairro}, ${e.cidade}.`,
    rotulo: "A entrega",
  });

  return fotos.map((foto, i) => ({ foto, ...frases[i] }));
}

/**
 * Seção-vitrine pinada: a página para, e três cenas (foto + uma frase)
 * passam sob o dedo do usuário no ritmo do scroll. É o momento "apresentar
 * o produto" — o resto da página informa; esta seção seduz.
 *
 * Pin SÓ no desktop (gsap.matchMedia): no celular — maioria do tráfego,
 * vindo de link de WhatsApp — pin + scrub brigam com o gesto de rolagem;
 * lá as cenas viram uma sequência empilhada com Reveal.
 */
export function CenaShowcase({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const raiz = useRef<HTMLDivElement>(null);
  const cenas = cenasDe(e);

  useEffect(() => {
    const el = raiz.current;
    if (!el || cenas.length < 3) return;

    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia(el);

    mm.add(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
      () => {
        const palco = el.querySelector<HTMLElement>("[data-palco]");
        const quadros = gsap.utils.toArray<HTMLElement>("[data-cena]", el);
        const legendas = gsap.utils.toArray<HTMLElement>("[data-legenda]", el);
        if (!palco || quadros.length < 2) return;

        // Estado inicial: só a primeira cena visível.
        gsap.set(quadros.slice(1), { autoAlpha: 0, scale: 1.06 });
        gsap.set(legendas.slice(1), { autoAlpha: 0, y: 28 });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: `+=${(quadros.length - 1) * 90}%`,
            pin: palco,
            scrub: 0.6,
          },
        });

        for (let i = 1; i < quadros.length; i++) {
          tl.to(legendas[i - 1], { autoAlpha: 0, y: -28, duration: 0.35 }, `cena${i}`)
            .to(quadros[i], { autoAlpha: 1, scale: 1, duration: 1 }, `cena${i}`)
            .to(legendas[i], { autoAlpha: 1, y: 0, duration: 0.4 }, `cena${i}+=0.5`)
            // Respiro entre cenas: um trecho sem nada mudando.
            .to({}, { duration: 0.4 });
        }

        // A foto continua VIVA durante o respiro. Sem isto, o trecho "sem
        // nada mudando" da timeline vira imagem congelada — que parece
        // player pausado, não cinema.
        quadros.forEach((quadro) => {
          const img = quadro.querySelector("img");
          if (!img) return;
          gsap.fromTo(
            img,
            { scale: 1, xPercent: 0 },
            {
              scale: 1.09,
              xPercent: -2,
              ease: "none",
              scrollTrigger: {
                trigger: el,
                start: "top top",
                end: `+=${(quadros.length - 1) * 90}%`,
                scrub: 0.6,
              },
            },
          );
        });
      },
    );

    return () => mm.revert();
  }, [cenas.length]);

  if (cenas.length < 3) return null;

  return (
    <div ref={raiz}>
      {/* Desktop: palco pinado. As classes de célula única empilham as cenas. */}
      <section data-palco className="hidden md:block">
        <div className="relative h-svh overflow-hidden">
          {cenas.map((c) => (
            <figure key={c.foto.url} data-cena className="absolute inset-0">
              <Image
                src={c.foto.url}
                alt={c.foto.alt}
                fill
                sizes="100vw"
                placeholder={c.foto.blurDataUrl ? "blur" : "empty"}
                blurDataURL={c.foto.blurDataUrl ?? undefined}
                className="object-cover"
              />
              {/* Véu para a legenda: contraste contra FOTO, escuro nos 2 temas. */}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-ink-950/25" />
            </figure>
          ))}

          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-8 pb-16">
            <div className="relative h-32">
              {cenas.map((c) => (
                <figcaption key={c.rotulo} data-legenda className="absolute inset-x-0 bottom-0">
                  <p className="text-fluid-xs mb-3 tracking-[0.22em] text-sand-300 uppercase">
                    {c.rotulo}
                  </p>
                  <p className="font-display text-fluid-2xl max-w-3xl leading-tight text-mist-50">
                    {c.frase}
                  </p>
                </figcaption>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Celular: as mesmas cenas, empilhadas, com reveal comum. */}
      <section className="space-y-10 px-4 py-16 md:hidden">
        {cenas.map((c) => (
          <Reveal key={c.foto.url}>
            <figure>
              {/* O celular fica sem pin, mas não precisa ficar sem
                  profundidade. A velocidade escrita é sempre a de desktop: o
                  fator de 40% do controlador reduz isto a ~0.056 na prática. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                <Camada velocidade={0.14} className="absolute inset-0 scale-110">
                  <Image
                    src={c.foto.url}
                    alt={c.foto.alt}
                    fill
                    sizes="100vw"
                    placeholder={c.foto.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={c.foto.blurDataUrl ?? undefined}
                    className="object-cover"
                  />
                </Camada>
              </div>
              <figcaption className="mt-4">
                <p className="text-fluid-xs mb-1 tracking-[0.22em] text-acento-suave uppercase">
                  {c.rotulo}
                </p>
                <p className="font-display text-fluid-xl leading-tight text-titulo">{c.frase}</p>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </section>
    </div>
  );
}
