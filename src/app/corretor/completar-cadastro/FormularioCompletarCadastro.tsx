"use client";

import { useActionState } from "react";
import { completarCadastro } from "./acoes";

const CAMPO = "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-fluid-base text-titulo outline-none transition-colors focus:border-acento";

export function FormularioCompletarCadastro() {
  const [estado, action, pendente] = useActionState(completarCadastro, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="nome" className="text-fluid-sm mb-1.5 block text-corpo">Seu nome completo</label>
        <input id="nome" name="nome" required autoComplete="name" className={CAMPO} />
      </div>
      <div>
        <label htmlFor="creci" className="text-fluid-sm mb-1.5 block text-corpo">CRECI</label>
        <input id="creci" name="creci" required autoComplete="off" className={CAMPO} />
      </div>
      <div>
        <label htmlFor="whatsapp" className="text-fluid-sm mb-1.5 block text-corpo">WhatsApp</label>
        <input id="whatsapp" name="whatsapp" required inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" className={CAMPO} />
      </div>
      {estado?.erro && <p role="alert" className="text-fluid-sm text-perigo">{estado.erro}</p>}
      <button type="submit" disabled={pendente} className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base w-full rounded-full px-7 py-3.5 font-semibold transition-colors disabled:opacity-60">
        {pendente ? "Salvando…" : "Concluir cadastro"}
      </button>
    </form>
  );
}
