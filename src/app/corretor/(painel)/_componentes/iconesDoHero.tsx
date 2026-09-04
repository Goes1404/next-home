import type { SVGProps } from "react";

/** Os três ícones das pílulas do cartão de abertura — mesma linha de 1.7 do menu. */
const traco = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function IconeBalao(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
export function IconeCalendarioCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4" />
    </svg>
  );
}
export function IconeMarcaFechado(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}
