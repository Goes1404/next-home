"use client";

import { rolarPara } from "@/components/motion/lenis";
import { cn } from "@/lib/utils";

/**
 * Convite para rolar até `alvo`, usando o Lenis já registrado (ver lenis.ts)
 * em vez de um `<a href="#...">` seco.
 *
 * ## O que mudou em 09/09/2026
 *
 * Era versalete tracked (`tracking-[0.2em] uppercase`) com `animate-bounce` —
 * duas marcas de página genérica, e a segunda é movimento em REPOUSO, que a
 * régua do painel já tinha descartado: movimento sem gesto compete com o
 * conteúdo. Agora só a seta se move, de leve, e o rótulo é uma frase normal
 * que DIZ o que há embaixo em vez de mandar rolar.
 *
 * `posicao="fluxo"` existe porque no herói da home o convite entra depois do
 * cartão de busca: ancorado em `absolute bottom-10` ele colidiria com a busca
 * em tela baixa, que é justamente onde o espaço é disputado.
 */
export function ScrollCue({
  alvo,
  label,
  posicao = "ancorado",
}: {
  alvo: string;
  label: string;
  posicao?: "ancorado" | "fluxo";
}) {
  return (
    <a
      href={`#${alvo}`}
      aria-label={label}
      onClick={(ev) => {
        ev.preventDefault();
        rolarPara(alvo);
      }}
      className={cn(
        "text-apoio hover:text-acento-suave group flex flex-col items-center gap-1.5 transition-colors",
        posicao === "ancorado" ? "absolute bottom-10" : "mt-10 sm:mt-12",
      )}
    >
      <span className="text-fluid-xs">{label}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.8}
        stroke="currentColor"
        aria-hidden
        className="motion-safe:animate-[descer_2.4s_ease-in-out_infinite] h-4 w-4 transition-transform group-hover:translate-y-0.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0-6-6m6 6 6-6" />
      </svg>
    </a>
  );
}
