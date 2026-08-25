import type { CampanhaListada } from "../acoes";

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

export function HistoricoCampanhas({ campanhas }: { campanhas: CampanhaListada[] }) {
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
