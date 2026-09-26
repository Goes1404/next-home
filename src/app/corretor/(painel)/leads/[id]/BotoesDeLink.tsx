"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { criarLinkDeDocumentos, criarSelecao, type LinkCriado } from "./linksAcoes";

/**
 * Os dois botões do cartão "Links para o cliente". Criado o link, a tela
 * oferece as duas saídas que o corretor usa: mandar pelo WhatsApp do
 * cliente com a mensagem pronta, ou copiar.
 */
export function BotoesDeLink({ leadId, telefone }: { leadId: string; telefone: string | null }) {
  const [criado, setCriado] = useState<{ url: string; mensagem: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  function criar(fn: (id: string) => Promise<LinkCriado>) {
    iniciar(async () => {
      try {
        const r = await fn(leadId);
        if ("erro" in r) return falhar(r.erro);
        setCriado(r);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  async function copiar() {
    if (!criado) return;
    try {
      await navigator.clipboard.writeText(criado.mensagem);
      avisar("Mensagem com o link copiada.");
    } catch {
      falhar("Não consegui copiar — selecione o link e copie à mão.");
    }
  }

  const digitos = telefone?.replace(/\D/g, "") ?? "";
  const wa = criado && digitos ? `https://wa.me/${digitos}?text=${encodeURIComponent(criado.mensagem)}` : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => criar(criarSelecao)}
          className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          Montar seleção de imóveis
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => criar(criarLinkDeDocumentos)}
          className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo hover:border-acento-linha disabled:opacity-60"
        >
          Pedir documentos
        </button>
      </div>

      {criado && (
        <div className="rounded-xl border border-acento-linha bg-acento-lavado p-3 space-y-2">
          <p className="text-fluid-xs text-corpo break-words">{criado.mensagem}</p>
          <div className="flex flex-wrap gap-2">
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 inline-flex items-center rounded-xl bg-[#25D366] px-4 text-fluid-xs font-bold text-white"
              >
                Enviar no WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={copiar}
              className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo"
            >
              Copiar
            </button>
            <a
              href={`${criado.url}?previa=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 inline-flex items-center rounded-xl px-3 text-fluid-xs text-apoio underline underline-offset-2"
            >
              Ver como o cliente vê
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
