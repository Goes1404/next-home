"use client";

import { useState, useTransition } from "react";
import { encerrarAviso } from "../avisosAosClientesAcoes";

/**
 * Tira um aviso do ar agora (ou cancela o agendado), com confirmação em
 * dois toques: o primeiro pergunta, o segundo encerra (29/10/2026).
 */
export function EncerrarAviso({ id, agendado }: { id: string; agendado: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function tocar() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    iniciar(async () => {
      const r = await encerrarAviso(id);
      if (!r.ok) setErro(r.erro);
      setConfirmando(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={tocar}
        disabled={pendente}
        className={`text-fluid-sm flex min-h-11 cursor-pointer items-center rounded-xl border px-4 font-medium disabled:opacity-50 ${
          confirmando ? "border-perigo-linha bg-perigo-lavado text-perigo" : "botao-secundario text-titulo"
        }`}
      >
        {pendente ? "Encerrando…" : confirmando ? "Confirmar: tirar do ar" : agendado ? "Cancelar agendamento" : "Encerrar agora"}
      </button>
      {confirmando && !pendente && (
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="text-fluid-sm text-apoio hover:text-titulo min-h-11 cursor-pointer px-2"
        >
          Voltar
        </button>
      )}
      {erro && (
        <p role="status" className="text-fluid-xs text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}
