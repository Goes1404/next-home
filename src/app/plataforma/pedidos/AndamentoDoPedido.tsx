"use client";

import { useActionState, useState } from "react";
import { ROTULO_DO_STATUS, STATUS_DO_PEDIDO, type StatusDoPedido } from "@/lib/plataforma/pedidoDeContratacao";
import { atualizarPedido, type ResultadoDoPedidoNaPlataforma } from "../pedidosAcoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

/**
 * O andamento do pedido (29/10/2026): status, observação da equipe e, ao
 * converter, a conta criada. Um formulário por cartão; a action confere a
 * guarda de novo e recusa "convertido" sem conta.
 */
export function AndamentoDoPedido({
  id,
  status,
  observacao,
  grupoCriadoId,
  grupos,
}: {
  id: string;
  status: StatusDoPedido;
  observacao: string;
  grupoCriadoId: string | null;
  grupos: { id: string; nome: string; tipo: string }[];
}) {
  const [estado, enviar, pendente] = useActionState<ResultadoDoPedidoNaPlataforma | undefined, FormData>(
    atualizarPedido,
    undefined,
  );
  const [escolhido, setEscolhido] = useState<StatusDoPedido>(status);

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Status
          <select
            name="status"
            value={escolhido}
            onChange={(e) => setEscolhido(e.target.value as StatusDoPedido)}
            className={CAMPO}
          >
            {STATUS_DO_PEDIDO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_DO_STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        {(escolhido === "convertido" || grupoCriadoId) && (
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            Conta criada
            <select name="grupo" defaultValue={grupoCriadoId ?? ""} className={CAMPO}>
              <option value="">Escolha a conta</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome} ({g.tipo === "independente" ? "independente" : "imobiliária"})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Observação da equipe
        <textarea
          name="observacao"
          defaultValue={observacao}
          maxLength={2000}
          rows={2}
          placeholder="Ex.: prefere falar depois das 18h"
          className={`${CAMPO} min-h-[4.5rem]`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="botao-secundario text-titulo text-fluid-sm flex min-h-11 cursor-pointer items-center px-4 font-medium disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Salvar andamento"}
        </button>
        <p role="status" className="text-fluid-xs">
          {estado?.ok && <span className="text-ok">Salvo.</span>}
          {estado && !estado.ok && <span className="text-perigo">{estado.erro}</span>}
        </p>
      </div>
    </form>
  );
}
