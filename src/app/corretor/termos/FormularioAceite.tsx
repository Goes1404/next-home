"use client";

import { useActionState } from "react";
import { aceitarTermos } from "./acoes";

/** O botão de aceite, com o estado de envio e o erro na própria tela. */
export function FormularioAceite() {
  const [estado, action, pendente] = useActionState(aceitarTermos, undefined);

  return (
    <form action={action} className="space-y-3">
      {estado?.erro && (
        <p role="alert" className="text-fluid-sm text-perigo">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base min-h-11 w-full rounded-full px-7 py-3.5 font-semibold transition-colors disabled:opacity-60"
      >
        {pendente ? "Registrando…" : "Li e aceito os termos"}
      </button>
    </form>
  );
}
