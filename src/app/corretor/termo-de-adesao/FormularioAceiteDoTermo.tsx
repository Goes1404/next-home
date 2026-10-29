"use client";

import { useActionState, useState } from "react";
import { aceitarTermoDeAdesao } from "./acoes";

/**
 * O aceite do termo de adesão (0247): a caixa "li e concordo" precisa estar
 * marcada para o botão valer (aceite de contrato é ato explícito, não um
 * clique de passagem). Envio e erro na própria tela.
 */
export function FormularioAceiteDoTermo() {
  const [estado, action, pendente] = useActionState(aceitarTermoDeAdesao, undefined);
  const [concordo, setConcordo] = useState(false);

  return (
    <form action={action} className="space-y-3 print:hidden">
      {estado?.erro && (
        <p role="alert" className="text-fluid-sm text-perigo">
          {estado.erro}
        </p>
      )}
      <label className="text-fluid-sm text-corpo flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={concordo}
          onChange={(e) => setConcordo(e.currentTarget.checked)}
          className="mt-1 size-5 shrink-0"
        />
        <span>Li o termo de adesão e concordo com ele em nome da conta, e tenho poderes para isso.</span>
      </label>
      <button
        type="submit"
        disabled={pendente || !concordo}
        className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base min-h-11 w-full rounded-full px-7 py-3.5 font-semibold transition-colors disabled:opacity-60"
      >
        {pendente ? "Registrando…" : "Aceitar o termo de adesão"}
      </button>
    </form>
  );
}

/** Imprimir ou salvar em PDF pelo próprio navegador ("Salvar como PDF"). */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="botao-secundario text-fluid-sm text-corpo min-h-11 w-full rounded-full px-7 py-3 print:hidden"
    >
      Imprimir ou salvar em PDF
    </button>
  );
}
