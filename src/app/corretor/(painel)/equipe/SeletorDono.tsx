"use client";

import { useState, useTransition } from "react";
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
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarTransicao] = useTransition();

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
          setErro(null);
          iniciarTransicao(async () => {
            const resultado = await atribuirLead(leadId, destino);
            if (resultado.erro) setErro(resultado.erro);
          });
        }}
        className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-2 py-1.5 text-mist-200 disabled:opacity-50"
      >
        <option value="">Sem dono</option>
        {equipe.map((corretor) => (
          <option key={corretor.id} value={corretor.id}>
            {corretor.nome}
          </option>
        ))}
      </select>
      {erro && (
        <span role="alert" className="text-fluid-xs text-sand-300">
          {erro}
        </span>
      )}
    </div>
  );
}
