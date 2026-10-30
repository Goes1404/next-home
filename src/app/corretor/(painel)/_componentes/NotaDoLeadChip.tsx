import type { NotaDoLead, RotuloDaNota } from "@/lib/crm/notaDoLead";

/*
 * O chip da nota do lead (IA no atendimento, 30/10/2026): na lista de leads,
 * nos cartões do funil, na ficha e nos Leads da equipe. Sem hook nem
 * "use client": serve à página do servidor e aos componentes de cliente.
 *
 * A cor nunca carrega o sentido sozinha: o rótulo está escrito, e o motivo
 * vai no `title` (e no texto, na versão completa).
 */
const ESTILO: Record<RotuloDaNota, string> = {
  quente: "border-perigo-linha bg-perigo-lavado text-perigo",
  morno: "border-alerta-linha bg-alerta-lavado text-alerta",
  frio: "border-info-linha bg-info-lavado text-info",
};

const ROTULO: Record<RotuloDaNota, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };

export function NotaDoLeadChip({
  nota,
  comMotivo = false,
  className = "",
}: {
  nota: NotaDoLead | null | undefined;
  /** Mostra o motivo ao lado (ficha); na lista ele fica só no `title`. */
  comMotivo?: boolean;
  className?: string;
}) {
  if (!nota) return null;
  const dica = nota.motivo ? `Nota ${nota.score}/100 — ${nota.motivo}` : `Nota ${nota.score}/100`;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span
        title={dica}
        aria-label={`Lead ${ROTULO[nota.label].toLowerCase()}, nota ${nota.score} de 100${nota.motivo ? `: ${nota.motivo}` : ""}`}
        data-nota={nota.label}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-semibold tabular-nums ${ESTILO[nota.label]}`}
      >
        {ROTULO[nota.label]} · {nota.score}
      </span>
      {comMotivo && nota.motivo && <span className="text-fluid-xs text-apoio min-w-0 truncate">{nota.motivo}</span>}
    </span>
  );
}
