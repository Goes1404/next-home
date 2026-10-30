"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { criarSelecao } from "./linksAcoes";
import { LinkCriadoParaEnviar } from "./LinkCriadoParaEnviar";

/**
 * O botão da vitrine em "Imóveis que combinam" (29/10/2026): monta o link
 * curto com os imóveis marcados (os sugeridos vêm marcados; o corretor tira
 * o que não quer mostrar) e entrega a mensagem pronta. Não envia nada
 * sozinho — `LinkCriadoParaEnviar` abre o WhatsApp do corretor.
 */
export function MandarVitrine({
  leadId,
  telefone,
  imoveis,
}: {
  leadId: string;
  telefone: string | null;
  imoveis: { id: string; nome: string }[];
}) {
  const [marcados, setMarcados] = useState<string[]>(imoveis.map((i) => i.id));
  const [criado, setCriado] = useState<{ url: string; mensagem: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const { falhar } = useAvisos();

  const alternar = (id: string) =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  function montar() {
    iniciar(async () => {
      try {
        const r = await criarSelecao(leadId, marcados);
        if ("erro" in r) return falhar(r.erro);
        setCriado(r);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  if (criado) return <LinkCriadoParaEnviar url={criado.url} mensagem={criado.mensagem} telefone={telefone} />;

  return (
    <div className="space-y-2">
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
        <legend className="sr-only">Imóveis da vitrine</legend>
        {imoveis.map((i) => (
          <label key={i.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-fluid-xs text-corpo">
            <input
              type="checkbox"
              checked={marcados.includes(i.id)}
              onChange={() => alternar(i.id)}
              className="h-4 w-4 accent-acento"
            />
            {i.nome}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        disabled={ocupado || marcados.length === 0}
        onClick={montar}
        className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
      >
        Montar vitrine com {marcados.length} {marcados.length === 1 ? "imóvel" : "imóveis"}
      </button>
    </div>
  );
}
