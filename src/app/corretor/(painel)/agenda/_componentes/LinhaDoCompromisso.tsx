import type { ItemCompromisso } from "@/lib/agenda/compromissos";
import { CancelarCompromisso } from "./FormulariosDeCompromisso";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Reunião ou bloqueio na lista do dia (0224). O bloqueio visto pelo gestor
 * chega sem título (só "ocupado" e de quem); o do próprio corretor tem o
 * motivo e o botão de cancelar.
 */
export function LinhaDoCompromisso({ item }: { item: ItemCompromisso }) {
  const ehReuniao = item.subtipo === "reuniao";
  const titulo = ehReuniao ? item.titulo || "Reunião" : item.titulo || "Horário bloqueado";
  return (
    <div className="cartao flex min-h-12 flex-wrap items-center gap-3 px-5 py-3">
      <span className="w-24 shrink-0 font-display text-titulo">
        {HORA.format(new Date(item.inicio))}–{HORA.format(new Date(item.fim))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-fluid-xs block font-medium text-apoio">{ehReuniao ? "Reunião" : "Ocupado"}</span>
        <span className="text-fluid-sm block break-words text-corpo">
          {item.corretorNome ? `${item.corretorNome}${item.titulo ? ` · ${titulo}` : ""}` : titulo}
        </span>
      </span>
      {item.podeCancelar && <CancelarCompromisso id={item.id} />}
    </div>
  );
}
