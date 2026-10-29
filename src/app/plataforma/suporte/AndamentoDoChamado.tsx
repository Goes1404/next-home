"use client";

import { useActionState } from "react";
import {
  ROTULO_DO_STATUS_DO_CHAMADO,
  STATUS_DO_CHAMADO,
  type StatusDoChamado,
} from "@/lib/plataforma/chamadoDeSuporte";
import { atualizarChamado, type ResultadoDoChamadoNaPlataforma } from "../suporteAcoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

/**
 * O andamento do chamado (29/10/2026): status e a anotação interna da
 * equipe. Um formulário por cartão; a action confere a guarda de novo.
 */
export function AndamentoDoChamado({
  id,
  status,
  respostaInterna,
}: {
  id: string;
  status: StatusDoChamado;
  respostaInterna: string;
}) {
  const [estado, enviar, pendente] = useActionState<ResultadoDoChamadoNaPlataforma | undefined, FormData>(
    atualizarChamado,
    undefined,
  );

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1 sm:max-w-xs">
        Status
        <select name="status" defaultValue={status} className={CAMPO}>
          {STATUS_DO_CHAMADO.map((s) => (
            <option key={s} value={s}>
              {ROTULO_DO_STATUS_DO_CHAMADO[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Anotação interna
        <textarea
          name="resposta_interna"
          defaultValue={respostaInterna}
          maxLength={2000}
          rows={2}
          placeholder="Ex.: respondi pelo WhatsApp; volto a falar na segunda"
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
