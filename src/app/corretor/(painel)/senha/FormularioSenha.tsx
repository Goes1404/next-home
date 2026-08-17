"use client";

import { useActionState } from "react";
import { trocarSenha } from "@/app/corretor/actions";

const CAMPO =
  "w-full rounded-xl border border-white/15 bg-ink-950/60 px-4 py-3 text-mist-50 outline-none transition-colors focus:border-brand-300";

export function FormularioSenha() {
  const [estado, action, pendente] = useActionState(trocarSenha, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="atual" className="text-fluid-sm mb-1.5 block text-mist-300">
          Senha atual
        </label>
        <input
          id="atual"
          name="atual"
          type="password"
          required
          autoComplete="current-password"
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="nova" className="text-fluid-sm mb-1.5 block text-mist-300">
          Nova senha
        </label>
        <input
          id="nova"
          name="nova"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={CAMPO}
        />
        <p className="text-fluid-xs mt-1 text-mist-500">Pelo menos 8 caracteres.</p>
      </div>

      <div>
        <label htmlFor="confirmacao" className="text-fluid-sm mb-1.5 block text-mist-300">
          Repita a nova senha
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={CAMPO}
        />
      </div>

      {estado?.erro && <p className="text-fluid-sm text-red-300">{estado.erro}</p>}
      {estado?.ok && <p className="text-fluid-sm text-brand-200">{estado.ok}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="rounded-full bg-brand-500 px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
      >
        {pendente ? "Alterando…" : "Alterar senha"}
      </button>
    </form>
  );
}
