"use client";

import { useActionState } from "react";
import { entrar } from "@/app/corretor/actions";

const CAMPO_BASE =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-titulo placeholder:text-tenue outline-none transition-colors focus:border-acento";

export function FormularioLogin() {
  const [estado, action, pendente] = useActionState(entrar, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-fluid-sm mb-1.5 block text-corpo">
          E-mail
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO_BASE} />
      </div>

      <div>
        <label htmlFor="senha" className="text-fluid-sm mb-1.5 block text-corpo">
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

      {estado?.erro && <p className="text-fluid-sm text-perigo">{estado.erro}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="w-full rounded-full bg-acento px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-acento-hover disabled:opacity-60"
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
