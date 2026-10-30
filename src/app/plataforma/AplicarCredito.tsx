"use client";

import { useState, useTransition } from "react";
import { marcarCreditoAplicado } from "./indicacoesAcoes";

/**
 * O botão "Marcar como aplicado" do crédito de indicação (0247). Confirma
 * antes: marcar é para DEPOIS de dar o desconto na cobrança, e não se
 * desfaz pela tela.
 */
export function AplicarCredito({ grupoId, creditoId }: { grupoId: string; creditoId: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function aplicar() {
    if (!window.confirm("Já deu o desconto na cobrança desta conta? Marcar como aplicado não se desfaz.")) return;
    setErro(null);
    iniciar(async () => {
      const r = await marcarCreditoAplicado(grupoId, creditoId);
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={aplicar}
        disabled={pendente}
        className="botao-secundario text-fluid-sm text-titulo inline-flex min-h-11 items-center rounded-full px-4 font-medium disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Marcar como aplicado"}
      </button>
      {erro && (
        <p role="alert" className="text-fluid-xs text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}
