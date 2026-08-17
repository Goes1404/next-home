"use client";

import { useActionState } from "react";
import { entrar } from "@/app/corretor/actions";

const CAMPO_BASE =
  "w-full rounded-xl border border-white/15 bg-ink-950/60 px-4 py-3 text-mist-50 placeholder:text-mist-500 outline-none transition-colors focus:border-brand-300";

export function FormularioLogin() {
  const [estado, action, pendente] = useActionState(entrar, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-fluid-sm mb-1.5 block text-mist-300">
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO_BASE} />
      </div>

      <div>
        <label htmlFor="senha" className="text-fluid-sm mb-1.5 block text-mist-300">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className={CAMPO_BASE}
        />
      </div>

      {estado?.erro && <p className="text-fluid-sm text-red-300">{estado.erro}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="w-full rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
