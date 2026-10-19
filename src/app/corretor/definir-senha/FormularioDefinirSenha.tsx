"use client";

import { useActionState } from "react";
import { CampoSenha } from "@/components/ui/CampoSenha";
import { definirSenha } from "./acoes";

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3.5 text-fluid-base text-titulo outline-none transition-colors focus:border-acento";

/**
 * Sem campo de senha atual: quem chega pelo convite nunca teve uma, e quem
 * esqueceu não sabe qual é. Com o olho nos dois campos — a senha é digitada
 * no celular, que não mostra o que foi tocado.
 */
export function FormularioDefinirSenha() {
  const [estado, action, pendente] = useActionState(definirSenha, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="nova" className="text-fluid-sm mb-1.5 block text-corpo">
          Nova senha
        </label>
        <CampoSenha id="nova" name="nova" required minLength={8} autoComplete="new-password" className={CAMPO} />
        <p className="text-fluid-xs mt-1 text-tenue">Pelo menos 8 caracteres.</p>
      </div>

      <div>
        <label htmlFor="confirmacao" className="text-fluid-sm mb-1.5 block text-corpo">
          Repita a senha
        </label>
        <CampoSenha
          id="confirmacao"
          name="confirmacao"
          required
          minLength={8}
          autoComplete="new-password"
          className={CAMPO}
        />
      </div>

      {estado?.erro && (
        <p role="alert" className="text-fluid-sm text-perigo">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base w-full rounded-full px-7 py-3.5 font-semibold transition-colors disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Salvar senha e entrar"}
      </button>
    </form>
  );
}
