"use client";

import { useActionState } from "react";
import { trocarSenha } from "@/app/corretor/actions";

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-titulo outline-none transition-colors focus:border-acento";

export function FormularioSenha() {
  const [estado, action, pendente] = useActionState(trocarSenha, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="atual" className="text-fluid-sm mb-1.5 block text-corpo">
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
        <label htmlFor="nova" className="text-fluid-sm mb-1.5 block text-corpo">
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
        <p className="text-fluid-xs mt-1 text-tenue">Pelo menos 8 caracteres.</p>
      </div>

      <div>
        <label htmlFor="confirmacao" className="text-fluid-sm mb-1.5 block text-corpo">
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

      {estado?.erro && <p className="text-fluid-sm text-perigo">{estado.erro}</p>}
      {estado?.ok && <p className="text-fluid-sm text-acento-suave">{estado.ok}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="rounded-full bg-acento px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-acento-hover disabled:opacity-60"
      >
        {pendente ? "Alterando…" : "Alterar senha"}
      </button>
    </form>
  );
}
