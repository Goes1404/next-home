"use client";

import { useEffect, useRef } from "react";
import { registrarCamada, type OpcoesCamada } from "./controladorCamadas";

/**
 * Liga um elemento ao controlador de camadas.
 *
 * Use o hook quando o componente já tem ref própria ou precisa do
 * `aoAtualizar` (véu que fecha, header que condensa). Para o caso comum,
 * `<Camada>` logo abaixo é mais direto.
 */
export function useCamada(
  ref: React.RefObject<HTMLElement | null>,
  opcoes: OpcoesCamada,
) {
  // As opções vivem numa ref para o efeito não re-registrar a cada render
  // por causa de um callback recriado — re-registrar limpa o transform e o
  // elemento pisca de volta ao lugar. A escrita acontece num efeito, não no
  // corpo do componente: ref tocada durante o render quebra a garantia de
  // pureza que o React 19 cobra (e o lint reprova).
  const atuais = useRef(opcoes);
  useEffect(() => {
    atuais.current = opcoes;
  });

  const { velocidade, eixo, apenasDesktop, escala } = opcoes;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    return registrarCamada(el, {
      velocidade,
      eixo,
      apenasDesktop,
      escala,
      aoAtualizar: (p) => atuais.current.aoAtualizar?.(p),
    });
  }, [ref, velocidade, eixo, apenasDesktop, escala]);
}

type Tag = "div" | "section" | "figure" | "span" | "li";

/**
 * Camada de profundidade: o elemento anda mais devagar (ou mais rápido, ou
 * ao contrário) que o scroll.
 *
 * Não mexe em opacidade de propósito — quem revela é o `Reveal`, e dois
 * donos da mesma opacidade fazem o elemento sumir. Pelo mesmo motivo, nunca
 * ponha `Camada` e `Reveal` no MESMO nó: os dois escrevem transform. O
 * padrão é `<Camada><Reveal>…</Reveal></Camada>`.
 *
 * E nada de `position: sticky` aqui dentro: o transform muda o containing
 * block e o elemento para de grudar.
 */
export function Camada({
  children,
  className,
  as: TagName = "div",
  velocidade,
  eixo,
  apenasDesktop,
  escala,
}: {
  children: React.ReactNode;
  className?: string;
  as?: Tag;
} & OpcoesCamada) {
  const ref = useRef<HTMLElement>(null);
  useCamada(ref, { velocidade, eixo, apenasDesktop, escala });

  return (
    // Junção crua: o twMerge do `cn` descarta os utilitários `text-fluid-*`.
    <TagName
      ref={ref as never}
      className={["will-change-transform", className].filter(Boolean).join(" ")}
    >
      {children}
    </TagName>
  );
}
