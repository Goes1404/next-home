"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { RECURSOS, ROTULO_DO_RECURSO, type Recurso } from "@/lib/planos/limitesDoPlano";
import { ajustarLimitesDoPlano } from "../../acoes";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full max-w-[12rem] rounded-xl border px-3.5 py-2.5 focus:outline-none";

const NUMERO = new Intl.NumberFormat("pt-BR");

/**
 * Os limites de artes, vídeos e mensagens de lista por mês do grupo (limites do plano).
 * Em branco, vale o do plano. No limite, a geração recusa com a conta e a
 * equipe espera o dia 1º. Mobile-first: um campo por linha, botão de 44px.
 */
export function FormularioLimitesDoPlano({
  grupoId,
  iniciais,
  padroes,
}: {
  grupoId: string;
  iniciais: Record<Recurso, number | null>;
  /** O limite do plano, já com os assentos; `null` = sem limite. */
  padroes: Record<Recurso, number | null>;
}) {
  const [textos, setTextos] = useState<Record<Recurso, string>>({
    arte: iniciais.arte === null ? "" : String(iniciais.arte),
    video: iniciais.video === null ? "" : String(iniciais.video),
    lista: iniciais.lista === null ? "" : String(iniciais.lista),
  });
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await ajustarLimitesDoPlano(grupoId, textos);
        setAviso(r.ok ? { texto: "Limites salvos.", erro: false } : { texto: r.erro, erro: true });
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      {RECURSOS.map((recurso) => (
        <div key={recurso} className="flex flex-col gap-1">
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            {ROTULO_DO_RECURSO[recurso]} por mês
            <input
              name={`limite-${recurso}`}
              inputMode="numeric"
              value={textos[recurso]}
              onChange={(e) => setTextos((t) => ({ ...t, [recurso]: e.target.value }))}
              placeholder="Do plano"
              className={CLASSE_DO_CAMPO}
            />
          </label>
          <p className="text-fluid-xs text-tenue">
            Em branco, vale o do plano ({padroes[recurso] === null ? "sem limite" : `${NUMERO.format(padroes[recurso])} por mês`}).
          </p>
        </div>
      ))}
      <p className="text-fluid-xs text-apoio">
        No limite, o painel recusa criar mais até o dia 1º e explica o motivo. Lista que não cabe no que resta é recusada inteira.
      </p>

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pendente}
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60"
        >
          {pendente ? "Salvando…" : "Salvar limites"}
        </button>
      </div>
    </form>
  );
}
