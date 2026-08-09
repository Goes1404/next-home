"use client";

import { rolarPara } from "@/components/motion/lenis";

/** Convite para rolar até `alvo`, usando o Lenis já registrado (ver lenis.ts) em vez de um `<a href="#...">` seco. */
export function ScrollCue({ alvo, label }: { alvo: string; label: string }) {
  return (
    <a
      href={`#${alvo}`}
      aria-label={label}
      onClick={(ev) => {
        ev.preventDefault();
        rolarPara(alvo);
      }}
      className="motion-reduce:animate-none absolute bottom-10 flex flex-col items-center gap-2 text-mist-300 transition-colors hover:text-brand-200 motion-safe:animate-bounce"
    >
      <span className="text-fluid-xs tracking-[0.2em] uppercase">{label}</span>
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0-6-6m6 6 6-6" />
      </svg>
    </a>
  );
}
