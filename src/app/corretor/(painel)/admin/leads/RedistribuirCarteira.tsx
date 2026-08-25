"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { redistribuirCarteira } from "@/app/corretor/(painel)/admin/acoes";

/**
 * Passa uma carteira inteira de mão — o gesto que faltava.
 *
 * O seletor unitário resolve o lead avulso; este bloco resolve o dia em que
 * alguém sai da empresa, entra de férias ou fica sobrecarregado. Sem ele, a
 * única saída era mover lead por lead — e só entre os ~50 mais recentes.
 *
 * A confirmação diz O NÚMERO ("47 leads"): reatribuir muda de quem é a
 * comissão, e ninguém deve mover meia carteira sem ler quantos são.
 */
export function RedistribuirCarteira({
  equipe,
}: {
  /** Ativos, com a contagem atual de leads — para o número aparecer ANTES do clique. */
  equipe: { id: string; nome: string; totalLeads: number }[];
}) {
  const [deId, setDeId] = useState<string>("");
  const [paraId, setParaId] = useState<string>("");
  const [resultado, setResultado] = useState<{ ok?: string; erro?: string } | null>(null);
  const [movendo, iniciar] = useTransition();

  const origem = equipe.find((c) => c.id === deId);
  // "" nunca chega aqui (o botão exige escolha); "sem_dono" é a origem virtual.
  const quantos = deId === "sem_dono" ? null : (origem?.totalLeads ?? 0);
  const pronto = deId !== "" && paraId !== "" && deId !== paraId;

  function executar() {
    if (!pronto || movendo) return;

    const destino = equipe.find((c) => c.id === paraId);
    const descricaoOrigem =
      deId === "sem_dono"
        ? "todos os leads SEM DONO"
        : `os ${quantos} lead${quantos === 1 ? "" : "s"} de ${origem?.nome}`;

    if (
      !confirm(
        `Passar ${descricaoOrigem} para ${destino?.nome}?\n\n` +
          `A comissão dos atendimentos futuros passa junto. A ação fica registrada e não é desfeita em massa.`,
      )
    ) {
      return;
    }

    setResultado(null);
    iniciar(async () => {
      const r = await redistribuirCarteira(deId === "sem_dono" ? null : deId, paraId);
      setResultado(r);
      if (r.ok) {
        setDeId("");
        setParaId("");
      }
    });
  }

  return (
    <section className="border-linha bg-superficie rounded-2xl border p-5">
      <h2 className="text-fluid-sm text-titulo font-medium">Passar carteira</h2>
      <p className="text-fluid-xs text-apoio mt-1">
        Todos os leads de um corretor (ou os sem dono) passam para outro, de uma vez — para
        desligamento, férias ou redistribuição de carga.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="carteira-de">
          De quem
        </label>
        <select
          id="carteira-de"
          value={deId}
          onChange={(e) => {
            setDeId(e.target.value);
            setResultado(null);
          }}
          className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl border px-3"
        >
          <option value="" disabled>
            De quem…
          </option>
          <option value="sem_dono">Leads sem dono</option>
          {equipe.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.totalLeads} lead{c.totalLeads === 1 ? "" : "s"})
            </option>
          ))}
        </select>

        <ArrowRight aria-hidden className="text-tenue h-4 w-4 shrink-0" />

        <label className="sr-only" htmlFor="carteira-para">
          Para quem
        </label>
        <select
          id="carteira-para"
          value={paraId}
          onChange={(e) => {
            setParaId(e.target.value);
            setResultado(null);
          }}
          className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 min-w-0 flex-1 cursor-pointer rounded-xl border px-3"
        >
          <option value="" disabled>
            Para quem…
          </option>
          {equipe
            .filter((c) => c.id !== deId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </select>

        <button
          type="button"
          onClick={executar}
          disabled={!pronto || movendo}
          className="bg-acento hover:bg-acento-hover text-fluid-sm flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl px-4 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {movendo ? "Passando…" : "Passar"}
        </button>
      </div>

      {resultado?.ok && <p className="text-fluid-xs text-ok mt-3">{resultado.ok}</p>}
      {resultado?.erro && (
        <p role="alert" className="text-fluid-xs text-alerta mt-3">
          {resultado.erro}
        </p>
      )}
    </section>
  );
}
