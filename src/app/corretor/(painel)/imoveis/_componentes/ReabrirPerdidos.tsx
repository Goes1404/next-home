"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { moverEtapaEmMassa } from "@/app/corretor/actions";

/**
 * Perdidos que combinam com o imóvel voltam ao funil em um toque
 * (26/09/2026). Antes, a tela só contava quantos eram e mandava mudar a
 * etapa na ficha, um por um — ou seja, ninguém reabria.
 *
 * Voltam para "Primeiro contato", não para "Novo": eles já foram abordados,
 * e o funil precisa dizer isso. E a decisão é do corretor — por isso é um
 * botão com confirmação, nunca um efeito colateral de abrir o imóvel.
 */
export function ReabrirPerdidos({
  perdidos,
  imovelSlug,
  ativos,
}: {
  perdidos: string[];
  imovelSlug: string;
  ativos: string[];
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const { falhar } = useAvisos();
  const router = useRouter();
  const n = perdidos.length;

  function reabrir() {
    if (!confirmando) return setConfirmando(true);
    iniciar(async () => {
      try {
        const r = await moverEtapaEmMassa(perdidos, "primeiro_contato");
        if (r.erro) return falhar(r.erro);
        const params = new URLSearchParams({
          imovel: imovelSlug,
          leads: [...ativos, ...perdidos].join(","),
        });
        router.push(`/corretor/campanhas?${params.toString()}`);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-fluid-xs text-apoio">
        {n === 1 ? "1 lead marcado como perdido também combina." : `${n} leads marcados como perdidos também combinam.`}
      </p>
      <button
        type="button"
        onClick={reabrir}
        disabled={ocupado}
        className={`min-h-11 rounded-xl px-4 text-fluid-xs font-semibold disabled:opacity-60 ${
          confirmando ? "bg-alerta-lavado text-alerta border border-alerta-linha" : "border border-linha-forte text-corpo hover:border-acento-linha"
        }`}
      >
        {ocupado
          ? "Reabrindo…"
          : confirmando
            ? `Confirmar: voltar ${n === 1 ? "ele" : `os ${n}`} para Primeiro contato`
            : `Reabrir ${n === 1 ? "e incluir" : `os ${n} e incluir`} na campanha`}
      </button>
    </div>
  );
}
