"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { situacaoDaTarefa, type Tarefa } from "@/lib/crm/timeline";
import { concluirTarefa, criarTarefa } from "./acoes";
import { Check } from "lucide-react";

/**
 * As tarefas do lead: o que precisa ser feito e quando.
 *
 * Não existe notificação por e-mail nem push (o projeto não tem SMTP) — o
 * lembrete é a tela. Por isso a mesma tarefa aparece aqui E no bloco "Para
 * hoje" da tela inicial: um dado que só vive na ficha é um dado que ninguém
 * lê, o mesmo erro que deixou 53 envios invisíveis em `historico_envios`.
 */

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** `datetime-local` fala hora local; o padrão é amanhã de manhã. */
function amanhaDeManha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ESTILO_SITUACAO: Record<string, string> = {
  atrasada: "border-alerta-linha bg-alerta-lavado",
  hoje: "border-acento-linha bg-acento-lavado",
  futura: "border-linha bg-vidro",
  concluida: "border-linha bg-vidro opacity-60",
};

export function ProximasAcoes({ leadId, tarefas }: { leadId: string; tarefas: Tarefa[] }) {
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState(amanhaDeManha);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const abertas = tarefas.filter((t) => !t.concluidaEm);
  const feitas = tarefas.filter((t) => t.concluidaEm).slice(0, 5);

  function criar() {
    iniciar(async () => {
      try {
        const r = await criarTarefa(leadId, titulo, new Date(prazo).toISOString());
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        // O sucesso é anunciado porque a tarefa nova entra numa lista ACIMA
        // do formulário: no celular, quem acabou de tocar "Agendar" está
        // olhando para o rodapé e não vê a linha aparecer.
        avisar("Tarefa agendada");
        setTitulo("");
        setPrazo(amanhaDeManha());
      } catch {
        falhar("Não deu para agendar. Confira a conexão e tente de novo.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-linha bg-elevado p-4 sm:p-5">
      <h2 className="text-fluid-base font-medium text-titulo">Próximas ações</h2>

      <div className="mt-4 space-y-2">
        {abertas.length === 0 && (
          <p className="text-fluid-sm text-tenue">
            Nada agendado. Marque o próximo retorno para este lead não esfriar.
          </p>
        )}
        {abertas.map((t) => {
          const situacao = situacaoDaTarefa(t);
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${ESTILO_SITUACAO[situacao]}`}
            >
              <button
                type="button"
                title="Concluir"
                aria-label={`Concluir: ${t.titulo}`}
                disabled={ocupado}
                onClick={() =>
                  iniciar(async () => {
                    try {
                      const r = await concluirTarefa(t.id);
                      if (r.erro) falhar(r.erro);
                    } catch {
                      falhar("Não deu para concluir a tarefa. Confira a conexão.");
                    }
                  })
                }
                /*
                  A caixa continua com 20px porque é uma marca de tarefa e não
                  um botão — mas o ALVO cresce para 44px por um pseudo-elemento
                  invisível. Antes eram 20px de área tocável mostrando um
                  ícone `text-transparent`, visível só no hover: no celular,
                  onde este painel é usado, isso é um quadrado vazio que erra
                  o dedo. Ícone visível sempre; o hover só reforça.
                */
                className="border-linha-forte text-apoio hover:border-ok hover:text-ok relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors before:absolute before:-inset-3 before:content-[''] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-fluid-sm text-titulo">{t.titulo}</p>
                <p className="text-fluid-xs text-tenue">
                  {situacao === "atrasada" && "Atrasada · "}
                  {situacao === "hoje" && "Hoje · "}
                  {dataHora.format(new Date(t.prazo))}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2 border-t border-linha pt-4">
        <input
          value={titulo}
          disabled={ocupado}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Retornar a ligação, enviar plantas…"
          className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full rounded-lg border px-3 disabled:opacity-50"
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="datetime-local"
            value={prazo}
            disabled={ocupado}
            aria-label="Prazo da tarefa"
            onChange={(e) => setPrazo(e.target.value)}
            className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 flex-1 rounded-lg border px-3 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={criar}
            disabled={ocupado || !titulo.trim()}
            className="text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave min-h-11 rounded-full border px-4 font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            Agendar
          </button>
        </div>
      </div>

      {feitas.length > 0 && (
        <details className="mt-4">
          <summary className="text-fluid-xs cursor-pointer text-tenue">
            Concluídas ({feitas.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {feitas.map((t) => (
              <li key={t.id} className="text-fluid-xs text-tenue line-through">
                {t.titulo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
