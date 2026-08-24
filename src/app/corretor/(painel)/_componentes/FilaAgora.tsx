import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BotaoConcluirTarefa } from "./BotaoConcluirTarefa";
import type { ItemFila, TipoItemFila } from "@/lib/crm/filaDeTrabalho";

/**
 * "Agora": a fila de trabalho no topo do Início (roadmap F3).
 *
 * Cada linha é uma ação com um botão do lado — o corretor não escolhe o que
 * fazer, ele faz o primeiro item. A cor da régua à esquerda separa urgência
 * de rotina sem depender de leitura: visita e tarefa vencida são as duas
 * coisas que somem se ninguém agir hoje.
 */

const REGUA: Record<TipoItemFila, string> = {
  visita_hoje: "bg-etapa-azul",
  tarefa_vencida: "bg-etapa-areia",
  lead_novo: "bg-acento",
  tarefa_hoje: "bg-acento",
  sem_revisao: "bg-linha-forte",
  lead_parado: "bg-linha-forte",
};

function IconeWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.25 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

export function FilaAgora({ itens }: { itens: ItemFila[] }) {
  if (itens.length === 0) {
    return (
      <section className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
        <h2 className="font-display text-titulo text-lg">Tudo em dia</h2>
        <p className="text-fluid-sm text-apoio mt-1">
          Nenhuma visita, lead novo ou tarefa esperando por você. Bom momento para divulgar seu
          link — quem chegar por ele já entra na sua carteira.
        </p>
      </section>
    );
  }

  return (
    <section className="border-acento-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 className="font-display text-titulo text-lg">Agora</h2>
        <span className="text-fluid-xs text-tenue tabular-nums">
          {itens.length} {itens.length === 1 ? "item" : "itens"}
        </span>
      </div>

      <ul className="divide-linha mt-4 divide-y">
        {itens.map((item) => (
          <li key={item.chave} className="flex items-stretch gap-3 pr-3 pl-0 sm:pr-4">
            <span aria-hidden className={`w-1 shrink-0 ${REGUA[item.tipo]}`} />

            <Link
              href={item.href}
              className="flex min-w-0 flex-1 items-center gap-2 py-3.5 transition-opacity hover:opacity-80"
            >
              <span className="min-w-0 flex-1">
                <span className="text-fluid-sm text-titulo block truncate font-medium">
                  {item.titulo}
                </span>
                <span className="text-fluid-xs text-apoio block truncate">{item.detalhe}</span>
              </span>
              <ArrowRight aria-hidden className="text-tenue h-4 w-4 shrink-0" />
            </Link>

            {item.whatsapp && (
              <a
                href={item.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Chamar no WhatsApp: ${item.titulo}`}
                title="Chamar no WhatsApp"
                className="my-2 flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full bg-[#25D366]/15 text-[#25D366] transition-colors hover:bg-[#25D366] hover:text-white"
              >
                <IconeWhatsapp className="h-5 w-5" />
              </a>
            )}

            {item.tarefaId && (
              <BotaoConcluirTarefa tarefaId={item.tarefaId} titulo={item.titulo} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
