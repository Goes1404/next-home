"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { concluirTarefa } from "./leads/[id]/acoes";
import { situacaoDaTarefa, type Tarefa } from "@/lib/crm/timeline";

/**
 * As tarefas atrasadas e as de hoje, na primeira tela que o corretor abre.
 *
 * Este bloco é o motivo de as tarefas existirem: sem SMTP no projeto não há
 * e-mail nem push, então o lembrete é a tela. Uma tarefa que só vivesse na
 * ficha do lead repetiria o erro do `historico_envios` — dado gravado que
 * ninguém lê.
 */

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ParaHoje({ tarefas }: { tarefas: Tarefa[] }) {
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [, iniciar] = useTransition();

  const visiveis = tarefas.filter((t) => !feitas.has(t.id));
  if (visiveis.length === 0) return null;

  return (
    <section className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
      <h2 className="text-fluid-base font-medium text-titulo">Para hoje</h2>
      <ul className="mt-4 space-y-2">
        {visiveis.map((t) => {
          const atrasada = situacaoDaTarefa(t) === "atrasada";
          return (
            <li
              key={t.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                atrasada
                  ? "border-etapa-areia-linha bg-etapa-areia-lavado"
                  : "border-linha bg-vidro"
              }`}
            >
              <button
                type="button"
                aria-label={`Concluir: ${t.titulo}`}
                title="Concluir"
                onClick={() =>
                  iniciar(async () => {
                    // Some da lista na hora; se o servidor recusar, o
                    // recarregamento seguinte a traz de volta.
                    setFeitas((atual) => new Set(atual).add(t.id));
                    await concluirTarefa(t.id);
                  })
                }
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-linha-forte text-transparent transition-colors hover:border-ok hover:text-ok"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-fluid-sm text-titulo">{t.titulo}</p>
                <p className="text-fluid-xs text-tenue">
                  {atrasada ? "Atrasada · " : ""}
                  {hora.format(new Date(t.prazo))}
                  {t.lead && (
                    <>
                      {" · "}
                      <Link
                        href={`/corretor/leads/${t.lead.id}`}
                        className="text-acento-suave underline-offset-4 hover:underline"
                      >
                        {t.lead.nome}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
