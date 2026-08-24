"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Phone } from "lucide-react";
import { moverEtapa } from "@/app/corretor/actions";
import { linkWhatsappLead } from "./CartaoLead";
import { cn } from "@/lib/utils";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil, type Lead } from "@/lib/types";

/**
 * A folha de ações do lead — o "toque longo" do celular, em versão explícita.
 *
 * No telefone, o cartão da lista mostra só a ação primária (WhatsApp); todo
 * o resto mora aqui: ligar, abrir a ficha e mover de etapa. Mesmo padrão de
 * gaveta do NavMobileBottom (véu + painel no rodapé + `inert`), porque é o
 * gesto que o polegar já conhece.
 *
 * Mover de etapa: dois toques — abrir a folha, tocar na etapa. `moverEtapa`
 * é o mesmo do quadro; o refresh recarrega a página do servidor, e um lead
 * que saiu do segmento atual some da lista, que é o comportamento honesto.
 */
export function FolhaAcoesLead({ lead, onFechar }: { lead: Lead; onFechar: () => void }) {
  const router = useRouter();
  const [movendo, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const whatsapp = linkWhatsappLead(lead);

  useEffect(() => {
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  function mover(etapa: EtapaFunil) {
    if (etapa === lead.etapa || movendo) return;
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await moverEtapa(lead.id, etapa);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  return (
    <div className="fixed inset-0 z-60">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar ações"
        onClick={onFechar}
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ações para ${lead.nome}`}
        className="border-linha bg-superficie pb-safe absolute inset-x-0 bottom-0 max-h-[85svh] overflow-y-auto rounded-t-3xl border-t px-5 pt-3 pb-6"
      >
        <span aria-hidden className="bg-linha-forte mx-auto mb-4 block h-1 w-10 rounded-full" />

        <p className="text-fluid-sm font-medium text-titulo truncate">{lead.nome}</p>
        {lead.telefone && <p className="text-fluid-xs mt-0.5 text-tenue">{lead.telefone}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fluid-sm col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-medium text-white transition-opacity hover:opacity-90"
            >
              Chamar no WhatsApp
            </a>
          )}
          {lead.telefone && (
            <a
              href={`tel:${lead.telefone}`}
              className="text-fluid-sm border-linha flex min-h-12 items-center justify-center gap-2 rounded-xl border text-corpo transition-colors hover:border-linha-forte"
            >
              <Phone className="h-4 w-4" /> Ligar
            </a>
          )}
          <Link
            href={`/corretor/leads/${lead.id}`}
            className={cn(
              "text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave flex min-h-12 items-center justify-center gap-2 rounded-xl border font-medium transition-opacity hover:opacity-85",
              !lead.telefone && "col-span-2",
            )}
          >
            Abrir ficha <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {erro && (
          <p
            role="alert"
            className="text-fluid-xs border-etapa-areia-linha bg-etapa-areia-lavado text-etapa-areia mt-3 rounded-xl border px-3 py-2"
          >
            {erro}
          </p>
        )}

        <p className="text-tenue mt-5 pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
          Mover para
        </p>
        <ul className="space-y-1">
          {ETAPAS_FUNIL.map((etapa) => {
            const atual = etapa === lead.etapa;
            return (
              <li key={etapa}>
                <button
                  type="button"
                  onClick={() => mover(etapa)}
                  disabled={atual || movendo}
                  aria-current={atual ? "true" : undefined}
                  className={cn(
                    "text-fluid-sm flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left transition-colors",
                    atual
                      ? "border-acento-linha bg-acento-lavado text-acento-suave font-medium"
                      : "border-linha text-corpo hover:border-linha-forte",
                    movendo && !atual && "opacity-60",
                  )}
                >
                  {ETAPA_LABEL[etapa]}
                  {atual && <Check className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
