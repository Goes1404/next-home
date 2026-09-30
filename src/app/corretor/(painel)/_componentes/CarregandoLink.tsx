"use client";

import { useLinkStatus } from "next/link";

/**
 * Uma linha que corre na base do item do menu enquanto a tela nova carrega
 * (30/09/2026). No celular, tocar num item e nada mudar por meio segundo se
 * lê como "o toque não pegou", e a pessoa toca de novo.
 *
 * Sempre renderizado, com tamanho fixo: só a opacidade muda, para não
 * empurrar o rótulo (a documentação do `useLinkStatus` avisa do salto de
 * layout). Precisa morar DENTRO de um `<Link>` com `relative`.
 */
export function CarregandoLink() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={
        "pointer-events-none absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full transition-opacity duration-150 " +
        (pending ? "opacity-100 delay-100" : "opacity-0")
      }
    >
      <span className="link-carregando block h-full w-1/3 rounded-full bg-current" />
    </span>
  );
}
