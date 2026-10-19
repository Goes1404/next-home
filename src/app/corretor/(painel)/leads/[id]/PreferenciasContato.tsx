"use client";

import { useState, useTransition } from "react";
import { Ban, ShieldCheck } from "lucide-react";
import type { PreferenciaContato } from "@/lib/crm/dadosLead";
import { definirPreferenciaContato, liberarContatoDoLead } from "./acoes";

const CANAL: Record<string, string> = { email: "E-mail", whatsapp: "WhatsApp", telefone: "Ligação" };

export function PreferenciasContato({
  leadId,
  preferencias,
  naoContatarEm = null,
}: {
  leadId: string;
  preferencias: PreferenciaContato[];
  /** Quando ele pediu para não ser contatado (0110). */
  naoContatarEm?: string | null;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  function alternar(item: PreferenciaContato) {
    iniciar(async () => {
      const resultado = await definirPreferenciaContato(
        leadId,
        item.canal as "email" | "whatsapp" | "telefone",
        !item.permitido,
      );
      setAviso(resultado.ok ?? resultado.erro ?? null);
    });
  }
  function liberar() {
    iniciar(async () => {
      try {
        const resultado = await liberarContatoDoLead(leadId);
        setAviso(resultado.ok ?? resultado.erro ?? null);
      } catch {
        setAviso("Não foi possível liberar agora. Recarregue a página e tente de novo.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-linha bg-elevado p-4 sm:p-5" aria-labelledby="preferencias-titulo">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento-lavado text-acento-suave">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="preferencias-titulo" className="text-fluid-base font-medium text-titulo">Contato autorizado</h2>
          <p className="text-fluid-xs mt-1 text-tenue">Finalidade: responder à solicitação deste lead.</p>
        </div>
      </div>
      {naoContatarEm && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-perigo/40 bg-perigo-lavado px-3 py-3">
          <p className="flex min-w-0 items-start gap-2 text-fluid-sm text-titulo">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-perigo" aria-hidden="true" />
            <span>
              Pediu para não receber mensagens em{" "}
              {new Date(naoContatarEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Está fora
              das listas e a IA não responde. Se foi engano, libere.
            </span>
          </p>
          <button
            type="button"
            disabled={pendente}
            onClick={liberar}
            className="min-h-11 rounded-lg border border-linha-forte px-3 text-xs font-medium text-titulo transition-colors hover:bg-vidro disabled:opacity-60"
          >
            Liberar contato
          </button>
        </div>
      )}
      {preferencias.length === 0 ? (
        <p className="text-fluid-sm mt-4 rounded-xl border border-dashed border-linha px-4 py-4 text-tenue">
          Sem registro detalhado — lead anterior à fundação de consentimentos.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {preferencias.map((item) => (
            <li key={item.canal} className="flex items-center justify-between gap-3 rounded-xl bg-vidro px-3 py-2">
              <span className="text-fluid-sm text-corpo">{CANAL[item.canal] ?? item.canal}</span>
              <button
                type="button"
                disabled={pendente}
                onClick={() => alternar(item)}
                className={`min-h-11 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-60 ${item.permitido ? "text-emerald-300 hover:bg-emerald-400/10" : "text-red-300 hover:bg-red-400/10"}`}
                aria-label={`${item.permitido ? "Bloquear" : "Reativar"} contato por ${CANAL[item.canal] ?? item.canal}`}
              >
                {item.permitido ? "Permitido" : "Bloqueado"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p role="status" className="text-fluid-xs mt-3 text-apoio">{aviso}</p>}
    </section>
  );
}
