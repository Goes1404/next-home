"use client";

import { useFormStatus } from "react-dom";

/**
 * O botão que gasta o token do link. Fica desabilitado a partir do primeiro
 * toque: um segundo toque mandaria o mesmo token de novo, e o Auth, que já o
 * gastou no primeiro, devolveria "link vencido" — a pessoa cairia na tela de
 * pedir outro link com a sessão já aberta pelo primeiro.
 *
 * Sem JavaScript o formulário continua funcionando (é um POST comum); só não
 * há a trava do segundo toque.
 */
export function BotaoContinuar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base min-h-11 w-full rounded-full px-7 py-3.5 font-semibold transition-colors disabled:opacity-60"
    >
      {pending ? "Abrindo…" : "Continuar"}
    </button>
  );
}
