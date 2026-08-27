"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { liberarEnvioAgora, type CampanhaListada } from "../acoes";

/**
 * O que já foi enviado. Mostra progresso e resposta — as duas perguntas que
 * o corretor faz depois de criar a campanha ("saiu?" e "adiantou?").
 */

const ROTULO_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "Rascunho",
  em_andamento: "Enviando",
  pausada: "Pausada",
  concluida: "Concluída",
};

const CLASSE_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "bg-vidro border-linha text-apoio",
  em_andamento: "bg-alerta-lavado border-alerta-linha text-alerta",
  pausada: "bg-vidro border-linha text-apoio",
  concluida: "bg-ok-lavado border-ok-linha text-ok",
};

/**
 * Botão de liberar UMA lista.
 *
 * O da barra de status solta a fila inteira do corretor; este existe para o
 * caso em que há mais de uma lista em andamento e só uma é urgente — soltar
 * todas seria mandar de madrugada quem podia esperar a manhã.
 */
function BotaoLiberar({ campanhaId, aoLiberar }: { campanhaId: string; aoLiberar?: () => void }) {
  const [liberando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  function liberar() {
    if (
      !confirm(
        "Esta lista vai sair AGORA, mesmo fora do horário comercial.\n\n" +
          "O intervalo entre uma mensagem e outra continua valendo. Confirma?",
      )
    ) {
      return;
    }
    iniciar(async () => {
      const resultado = await liberarEnvioAgora({ campanhaId });
      setAviso(
        "erro" in resultado
          ? resultado.erro
          : `${resultado.mensagens} mensagem${resultado.mensagens === 1 ? "" : "s"} saindo agora.`,
      );
      if (!("erro" in resultado)) aoLiberar?.();
    });
  }

  if (aviso) return <span className="text-fluid-xs text-apoio">{aviso}</span>;

  return (
    <button
      type="button"
      onClick={liberar}
      disabled={liberando}
      className="text-fluid-xs border-alerta-linha text-alerta flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 transition-opacity hover:opacity-80 disabled:opacity-60"
    >
      <Clock className="h-3.5 w-3.5" />
      {liberando ? "Liberando…" : "Liberar agora"}
    </button>
  );
}

export function HistoricoCampanhas({
  campanhas,
  aoLiberar,
}: {
  campanhas: CampanhaListada[];
  /** A casca recarrega o status da fila quando uma lista é liberada. */
  aoLiberar?: () => void;
}) {
  if (campanhas.length === 0) {
    return (
      <p className="text-fluid-sm text-tenue py-6 text-center">
        Nenhuma lista de transmissão ainda. A primeira você cria aí em cima.
      </p>
    );
  }

  return (
    <section>
      <h2 className="font-display text-titulo text-lg">Já enviadas</h2>

      <ul className="divide-linha mt-3 divide-y">
        {campanhas.map((c) => {
          const perc = c.totalLeads > 0 ? Math.round((c.totalEnviados / c.totalLeads) * 100) : 0;
          const taxaResposta =
            c.totalEnviados > 0 ? Math.round((c.totalRespondidos / c.totalEnviados) * 100) : 0;

          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-fluid-sm text-titulo font-medium">{c.titulo}</p>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${CLASSE_STATUS[c.status]}`}
                  >
                    {ROTULO_STATUS[c.status]}
                  </span>
                </div>
                <p className="text-fluid-xs text-apoio mt-0.5">
                  {c.empreendimentoNome ?? "Sem imóvel vinculado"} ·{" "}
                  {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                </p>
              </div>

              <div className="text-fluid-xs flex shrink-0 items-center gap-5">
                <div>
                  <span className="text-tenue block text-[10px]">Enviadas</span>
                  <span className="text-titulo font-medium tabular-nums">
                    {c.totalEnviados}/{c.totalLeads} ({perc}%)
                  </span>
                </div>
                <div>
                  <span className="text-tenue block text-[10px]">Responderam</span>
                  <span className="text-ok font-medium tabular-nums">
                    {c.totalRespondidos} ({taxaResposta}%)
                  </span>
                </div>
              </div>

              {c.status === "em_andamento" && c.totalEnviados < c.totalLeads && (
                <BotaoLiberar campanhaId={c.id} aoLiberar={aoLiberar} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
