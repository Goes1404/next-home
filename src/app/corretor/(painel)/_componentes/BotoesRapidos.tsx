"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { alternarRoleta, pausarIa } from "./acoesRapidas";

const CONFIGURAR_ROLETA = "/corretor/marketing/impulsionamentos?aba=roleta";

export function BotoesRapidos({
  iaPausada,
  roletaLigada,
  roletaComLista,
}: {
  iaPausada: boolean;
  roletaLigada: boolean;
  roletaComLista: boolean;
}) {
  const [pausada, setPausada] = useState(iaPausada);
  const [ligada, setLigada] = useState(roletaLigada);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function tocarIa() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await pausarIa(!pausada);
        if (r.erro) setErro(r.erro);
        else setPausada(!pausada);
      } catch {
        setErro("Não foi possível agora. Recarregue a página e tente de novo.");
      }
    });
  }

  function tocarRoleta() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await alternarRoleta(!ligada);
        if (r.erro === "sem_lista") setErro("Escolha antes quem recebe os leads, em Anúncios pagos.");
        else if (r.erro) setErro(r.erro);
        else setLigada(!ligada);
      } catch {
        setErro("Não foi possível agora. Recarregue a página e tente de novo.");
      }
    });
  }

  const base =
    "botao-vivo flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-fluid-sm font-semibold disabled:opacity-60";

  return (
    <section aria-label="Controles rápidos" className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={tocarIa}
          disabled={ocupado}
          aria-pressed={pausada}
          className={`${base} ${pausada ? "border-alerta bg-alerta-lavado text-titulo" : "border-linha-forte bg-elevado text-titulo"}`}
        >
          <span aria-hidden className="text-xl">{pausada ? "▶️" : "⏸️"}</span>
          <span className="min-w-0">
            {pausada ? "Retomar a IA" : "Pausar a IA"}
            <span className="block text-fluid-xs font-normal text-corpo">
              {pausada ? "A IA está pausada: ninguém recebe resposta dela." : "A IA está respondendo os clientes."}
            </span>
          </span>
        </button>

        {roletaComLista || ligada ? (
          <button
            type="button"
            onClick={tocarRoleta}
            disabled={ocupado}
            aria-pressed={ligada}
            className={`${base} ${ligada ? "border-acento bg-acento-lavado text-titulo" : "border-linha-forte bg-elevado text-titulo"}`}
          >
            <span aria-hidden className="text-xl">🎯</span>
            <span className="min-w-0">
              {ligada ? "Parar de dividir os leads do anúncio" : "Dividir os leads do anúncio"}
              <span className="block text-fluid-xs font-normal text-corpo">
                {ligada ? "Leads do seu anúncio vão para a lista da roleta." : "Os leads do seu anúncio ficam com você."}
              </span>
            </span>
          </button>
        ) : (
          <Link href={CONFIGURAR_ROLETA} className={`${base} border-linha-forte bg-elevado text-titulo`}>
            <span aria-hidden className="text-xl">🎯</span>
            <span className="min-w-0">
              Dividir os leads do anúncio
              <span className="block text-fluid-xs font-normal text-corpo">Escolha quem recebe para começar.</span>
            </span>
          </Link>
        )}
      </div>
      {erro && (
        <p role="status" className="text-fluid-sm text-perigo">
          {erro}{" "}
          {erro.includes("Anúncios pagos") && (
            <Link href={CONFIGURAR_ROLETA} className="link-acao">
              Configurar
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
