import Link from "next/link";
import type { ItemDaAgenda } from "@/lib/agenda/itens";
import type { DadosDoPreparo } from "@/lib/crm/preparoDaVisita";
import { CartaoDaVisita } from "./CartaoDaVisita";
import { LinhaDoCompromisso } from "./LinhaDoCompromisso";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Os compromissos do dia escolhido, na ordem. A visita leva o cartão inteiro
 * (é o compromisso com cliente); tarefa e lembrete são uma linha que leva à
 * ficha ou às anotações, onde se conclui.
 */
export function ListaDoDia({
  itens,
  preparoPorLead,
  vistaDe,
}: {
  itens: ItemDaAgenda[];
  preparoPorLead: Map<string, DadosDoPreparo>;
  vistaDe?: string;
}) {
  if (itens.length === 0) {
    return (
      <div className="cartao p-5">
        <p className="text-fluid-sm text-corpo">Nada marcado neste dia.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {itens.map((item) => (
        <li key={`${item.tipo}-${item.id}`}>
          {item.tipo === "visita" ? (
            <CartaoDaVisita visita={item} preparo={preparoPorLead.get(item.leadId) ?? {}} vistaDe={vistaDe} />
          ) : item.tipo === "compromisso" ? (
            <LinhaDoCompromisso item={item} />
          ) : (
            <Link
              href={item.leadId ? `/corretor/leads/${item.leadId}` : "/corretor/anotacoes"}
              className="cartao flex min-h-12 items-center gap-3 px-5 py-3 transition-colors hover:bg-elevado"
            >
              <span className="w-12 shrink-0 font-display text-titulo">{HORA.format(new Date(item.inicio))}</span>
              <span className="min-w-0">
                <span className="text-fluid-xs block font-medium text-apoio">
                  {item.tipo === "tarefa" ? "Tarefa" : "Lembrete"}
                </span>
                <span className="text-fluid-sm block break-words text-corpo">
                  {item.tipo === "tarefa" ? `${item.titulo}${item.nome ? ` · ${item.nome}` : ""}` : item.texto}
                </span>
              </span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
