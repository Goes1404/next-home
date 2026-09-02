"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { atribuirLead } from "@/app/corretor/actions";

/**
 * Passa um lead para outro corretor.
 *
 * Sem estado otimista aqui, ao contrário do quadro: reatribuir muda de quem é
 * a comissão, e é melhor o gestor esperar meio segundo do que ver "pronto" e
 * descobrir depois que não foi. O `revalidatePath` na action redesenha a
 * lista com a verdade do banco.
 */
export function SeletorDono({
  leadId,
  donoAtual,
  equipe,
}: {
  leadId: string;
  donoAtual: string | null;
  equipe: { id: string; nome: string }[];
}) {
  const [salvando, iniciarTransicao] = useTransition();
  const { falhar } = useAvisos();

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="sr-only" htmlFor={`dono-${leadId}`}>
        Corretor responsável
      </label>
      <select
        id={`dono-${leadId}`}
        defaultValue={donoAtual ?? ""}
        disabled={salvando}
        onChange={(e) => {
          const destino = e.target.value;
          if (!destino) return;
          iniciarTransicao(async () => {
            const resultado = await atribuirLead(leadId, destino);
            if (resultado.erro) falhar(resultado.erro);
          });
        }}
        className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-2 py-1.5 text-corpo disabled:opacity-50"
      >
        {/* Desabilitada de propósito: não existe ação "tirar o dono" — a
            opção é só o estado inicial do lead órfão. Selecionável, ela era
            um botão que não fazia nada. */}
        <option value="" disabled>
          {donoAtual ? "Passar para…" : "Sem dono — escolher"}
        </option>
        {equipe.map((corretor) => (
          <option key={corretor.id} value={corretor.id}>
            {corretor.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
