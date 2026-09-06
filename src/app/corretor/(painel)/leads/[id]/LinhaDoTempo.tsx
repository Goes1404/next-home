"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { agruparPorDia, type Interacao, type TipoInteracao } from "@/lib/crm/timeline";
import { adicionarNota } from "./acoes";
import { ArrowRight, CalendarCheck, MessageSquare, Phone, Settings, StickyNote } from "lucide-react";

/**
 * O histórico do lead, do mais recente para o mais antigo.
 *
 * Mescla as interações do CRM com as mensagens reais do WhatsApp (a mescla
 * acontece na leitura, em `dadosLead.ts` — as mensagens NÃO são copiadas
 * para cá; duas cópias seriam duas verdades para divergir).
 */

const ICONE: Record<TipoInteracao, typeof StickyNote> = {
  nota: StickyNote,
  mensagem: MessageSquare,
  ligacao: Phone,
  etapa: ArrowRight,
  visita: CalendarCheck,
  sistema: Settings,
};

const COR: Record<TipoInteracao, string> = {
  nota: "border-linha bg-vidro text-corpo",
  mensagem: "border-acento-linha bg-acento-lavado text-acento-suave",
  ligacao: "border-linha bg-vidro text-corpo",
  etapa: "border-etapa-visita-linha bg-etapa-visita-lavado text-etapa-visita",
  visita: "border-etapa-visita-linha bg-etapa-visita-lavado text-etapa-visita",
  sistema: "border-linha bg-vidro text-tenue",
};

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

/** "2026-08-22" → data local, sem o fuso do ISO puxar para o dia anterior. */
function rotuloDoDia(dia: string): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  const data = new Date(ano, mes - 1, d);
  const hoje = new Date();
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(data, hoje)) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (mesmoDia(data, ontem)) return "Ontem";
  return diaLongo.format(data);
}

export function LinhaDoTempo({ leadId, itens }: { leadId: string; itens: Interacao[] }) {
  const [nota, setNota] = useState("");
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const grupos = agruparPorDia(itens);

  return (
    <section className="rounded-2xl border border-linha bg-elevado p-4 sm:p-5">
      <h2 className="text-fluid-base font-medium text-titulo">Histórico</h2>

      <div className="mt-4">
        <textarea
          value={nota}
          rows={2}
          disabled={ocupado}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Anotar o que foi conversado…"
          className="text-fluid-sm border-linha-forte bg-campo text-corpo w-full resize-y rounded-lg border px-3 py-2.5 disabled:opacity-50"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={ocupado || !nota.trim()}
            onClick={() => {
              iniciar(async () => {
                try {
                  const r = await adicionarNota(leadId, nota);
                  if (r.erro) {
                    falhar(r.erro);
                    return;
                  }
                  // A nota entra no histórico ABAIXO, e o campo esvaziar não
                  // é prova de que gravou — pode ter esvaziado por engano.
                  avisar("Anotado");
                  setNota("");
                } catch {
                  falhar("Não deu para anotar. Confira a conexão e tente de novo.");
                }
              });
            }}
            className="text-fluid-sm border-linha-forte bg-vidro-forte text-corpo hover:border-acento-linha min-h-11 rounded-full border px-4 font-medium transition-colors disabled:opacity-50"
          >
            {ocupado ? "Anotando…" : "Anotar"}
          </button>
        </div>
      </div>

      {grupos.length === 0 ? (
        <p className="text-fluid-sm mt-5 text-tenue">
          Nada registrado ainda. Toda mensagem, mudança de etapa e anotação aparece aqui.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.dia}>
              <h3 className="text-fluid-xs mb-2 font-medium text-tenue uppercase">
                {rotuloDoDia(grupo.dia)}
              </h3>
              <ul className="space-y-2">
                {grupo.itens.map((item) => {
                  const Icone = ICONE[item.tipo] ?? StickyNote;
                  return (
                    <li key={item.id} className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${COR[item.tipo]}`}
                      >
                        <Icone className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-fluid-sm whitespace-pre-wrap text-corpo">
                          {item.conteudo}
                        </p>
                        <p className="text-fluid-xs text-tenue">
                          {hora.format(new Date(item.em))}
                          {item.autor && ` · ${item.autor}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
