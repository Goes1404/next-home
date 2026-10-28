"use client";

import { useActionState } from "react";
import { passarVisitaDoFormulario } from "../acoesDaEquipe";

/**
 * "Passar para outro corretor" na lista da equipe (fase 2). Formulário
 * pequeno, fechado por padrão; o erro (conflito na agenda de quem recebe)
 * aparece aqui mesmo — nunca some calado.
 */
export function PassarVisita({
  visitaId,
  corretorAtualId,
  equipe,
}: {
  visitaId: string;
  corretorAtualId: string;
  equipe: { id: string; nome: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(passarVisitaDoFormulario, null);
  const outros = equipe.filter((c) => c.id !== corretorAtualId);
  if (outros.length === 0) return null;

  return (
    <details className="mt-3">
      <summary className="text-fluid-sm min-h-11 cursor-pointer font-medium text-acento">Passar para outro corretor</summary>
      <form action={enviar} className="mt-2 flex flex-wrap gap-2">
        <input type="hidden" name="visita" value={visitaId} />
        <label className="sr-only" htmlFor={`para-${visitaId}`}>
          Para quem
        </label>
        <select
          id={`para-${visitaId}`}
          name="para"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-elevado px-3 text-sm text-corpo"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Escolha quem faz a visita
          </option>
          {outros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button type="submit" disabled={enviando} className="botao-solido min-h-11 px-4 text-sm">
          {enviando ? "Passando…" : "Passar"}
        </button>
      </form>
      {estado?.erro && (
        <p role="alert" className="text-fluid-xs mt-2 text-alerta">
          {estado.erro}
        </p>
      )}
      {estado?.ok && <p className="text-fluid-xs mt-2 text-ok">Visita passada. Os dois corretores foram avisados.</p>}
    </details>
  );
}
