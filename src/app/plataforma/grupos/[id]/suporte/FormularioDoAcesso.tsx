"use client";

import { useActionState } from "react";
import { MOTIVO_MAXIMO, MOTIVO_PADRAO } from "@/lib/plataforma/acessoDeSuporte";
import { abrirVisaoDeSuporte } from "../../../visaoDeSuporteAcoes";

/**
 * O registro antes da visão de suporte (0243, 29/10/2026): o motivo já vem
 * escrito, então abrir é um clique. Funciona sem JS (a action redireciona).
 */
export function FormularioDoAcesso({ grupoId }: { grupoId: string }) {
  const [estado, enviar, pendente] = useActionState(abrirVisaoDeSuporte.bind(null, grupoId), undefined);
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
        Motivo do acesso
        <input
          name="motivo"
          defaultValue={MOTIVO_PADRAO}
          maxLength={MOTIVO_MAXIMO}
          className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none"
        />
      </label>
      {estado && !estado.ok && (
        <p role="alert" className="text-fluid-sm border-perigo-linha bg-perigo-lavado text-perigo rounded-xl border px-4 py-3">
          {estado.erro}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={pendente}
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60"
        >
          {pendente ? "Registrando…" : "Registrar e abrir"}
        </button>
      </div>
    </form>
  );
}
