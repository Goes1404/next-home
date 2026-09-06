"use client";

import { useActionState } from "react";
import { salvarPerfil } from "@/app/corretor/actions";
import type { CorretorPerfil } from "@/lib/types";

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-titulo placeholder:text-tenue outline-none transition-colors focus:border-acento";

/** "5511991234567" → "(11) 99123-4567", para editar em formato legível. */
function paraExibicao(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return e164;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

export function FormularioPerfil({ corretor }: { corretor: CorretorPerfil }) {
  const [estado, action, pendente] = useActionState(salvarPerfil, undefined);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="nome" className="text-fluid-sm mb-1.5 block text-corpo">
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          minLength={2}
          maxLength={120}
          defaultValue={corretor.nome}
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="whatsapp" className="text-fluid-sm mb-1.5 block text-corpo">
          WhatsApp
        </label>
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          required
          defaultValue={paraExibicao(corretor.whatsapp)}
          placeholder="(11) 91234-5678"
          className={CAMPO}
        />
        <p className="text-fluid-xs mt-1 text-tenue">
          É o número que recebe todos os contatos dos seus links.
        </p>
      </div>

      <div>
        <label htmlFor="bio" className="text-fluid-sm mb-1.5 block text-corpo">
          Apresentação
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={600}
          defaultValue={corretor.bio ?? ""}
          placeholder="Há quanto tempo atua, regiões que conhece melhor, tipo de imóvel com que mais trabalha…"
          className={CAMPO}
        />
        <p className="text-fluid-xs mt-1 text-tenue">
          Aparece na sua página pública, para o cliente saber com quem vai falar.
        </p>
      </div>

      {estado?.erro && <p className="text-fluid-sm text-perigo">{estado.erro}</p>}
      {estado?.ok && <p className="text-fluid-sm text-acento-suave">{estado.ok}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="rounded-full bg-acento px-7 py-3 text-sm font-medium text-sobre-cor transition-colors hover:bg-acento-hover disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}
