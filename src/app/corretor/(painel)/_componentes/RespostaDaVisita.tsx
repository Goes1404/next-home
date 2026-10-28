"use client";

import { useActionState, useState } from "react";
import { responderVisitaDoPainel } from "./acoesDaVisitaPassada";

const BOTAO = "botao-secundario min-h-11 flex-1 px-3 text-sm";
const CAMPO = "min-h-11 rounded-xl bg-elevado px-3 text-sm text-corpo";

/** Os três botões da cobrança (1 aconteceu · 2 cliente faltou · 3 remarcou). */
export function RespostaDaVisita({ visitaId }: { visitaId: string }) {
  const [estado, enviar, enviando] = useActionState(responderVisitaDoPainel, null);
  const [remarcando, setRemarcando] = useState(false);

  if (estado?.ok) return <p className="text-fluid-xs mt-2 text-ok">{estado.ok}</p>;

  return (
    <div className="mt-2">
      {!remarcando ? (
        <div className="flex flex-wrap gap-2">
          <form action={enviar} className="flex flex-1">
            <input type="hidden" name="visita" value={visitaId} />
            <button type="submit" name="resposta" value="aconteceu" disabled={enviando} className={BOTAO}>
              Aconteceu
            </button>
          </form>
          <form action={enviar} className="flex flex-1">
            <input type="hidden" name="visita" value={visitaId} />
            <button type="submit" name="resposta" value="faltou" disabled={enviando} className={BOTAO}>
              Cliente faltou
            </button>
          </form>
          <button type="button" onClick={() => setRemarcando(true)} className={BOTAO}>
            Remarcou
          </button>
        </div>
      ) : (
        <form action={enviar} className="flex flex-wrap gap-2">
          <input type="hidden" name="visita" value={visitaId} />
          <input type="hidden" name="resposta" value="remarcou" />
          <label className="sr-only" htmlFor={`dia-${visitaId}`}>
            Novo dia
          </label>
          <input id={`dia-${visitaId}`} type="date" name="dia" required className={CAMPO} />
          <label className="sr-only" htmlFor={`hora-${visitaId}`}>
            Nova hora
          </label>
          <input id={`hora-${visitaId}`} type="time" name="hora" step={900} required className={CAMPO} />
          <button type="submit" disabled={enviando} className="botao-solido min-h-11 px-4 text-sm">
            Remarcar
          </button>
          <button type="button" onClick={() => setRemarcando(false)} className="botao-secundario min-h-11 px-3 text-sm">
            Voltar
          </button>
        </form>
      )}
      {estado?.erro && (
        <p role="alert" className="text-fluid-xs mt-2 text-alerta">
          {estado.erro}
        </p>
      )}
    </div>
  );
}
