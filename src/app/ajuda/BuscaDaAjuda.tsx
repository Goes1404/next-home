"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Artigo } from "@/lib/ajuda/artigos";
import { buscarArtigos } from "@/lib/ajuda/busca";

/**
 * A busca da central de ajuda, no navegador (os artigos já vieram na
 * página). Filtra enquanto digita; sem resultado, sugere o suporte.
 */
export function BuscaDaAjuda({ artigos }: { artigos: Artigo[] }) {
  const [consulta, setConsulta] = useState("");
  const achados = useMemo(() => buscarArtigos(artigos, consulta), [artigos, consulta]);

  return (
    <div>
      <label htmlFor="busca-da-ajuda" className="block text-sm font-medium text-[var(--tinta)]">
        O que você quer fazer?
      </label>
      <input
        id="busca-da-ajuda"
        type="search"
        value={consulta}
        onChange={(e) => setConsulta(e.currentTarget.value)}
        placeholder="Ex.: conectar whatsapp, boleto, notificação"
        autoComplete="off"
        className="mt-2 min-h-12 w-full rounded-xl border border-[var(--linha)] bg-white px-4 text-base text-[var(--tinta)] outline-none focus:border-[var(--azul)]"
      />
      <p className="mt-2 text-sm text-[var(--tinta-suave)]" aria-live="polite">
        {consulta.trim()
          ? achados.length === 0
            ? "Nenhum artigo encontrado. Tente outra palavra ou fale com o suporte."
            : `${achados.length} ${achados.length === 1 ? "artigo" : "artigos"}`
          : `${artigos.length} artigos`}
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {achados.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/ajuda/${a.slug}`}
              className="flex h-full min-h-11 flex-col rounded-2xl border border-[var(--linha)] bg-white p-4 transition-colors hover:border-[var(--azul)]"
            >
              <span className="font-semibold text-[var(--tinta)]">{a.titulo}</span>
              <span className="mt-1 text-sm text-[var(--tinta-suave)]">{a.resumo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
