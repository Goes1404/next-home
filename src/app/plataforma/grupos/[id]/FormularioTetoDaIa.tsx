"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { ajustarTetoDaIa } from "../../acoes";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full max-w-[12rem] rounded-xl border px-3.5 py-2.5 focus:outline-none";

/**
 * O limite de respostas da IA por mês do grupo (fase 2B). Em branco, vale o
 * do plano. Ao chegar no limite a IA para de responder os clientes do grupo
 * e a equipe atende pelo painel até o dia 1º.
 */
export function FormularioTetoDaIa({
  grupoId,
  inicial,
  padraoDoPlano,
}: {
  grupoId: string;
  inicial: number | null;
  /** O limite do plano, já com os assentos; `null` = sem limite. */
  padraoDoPlano: number | null;
}) {
  const [texto, setTexto] = useState(inicial === null ? "" : String(inicial));
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await ajustarTetoDaIa(grupoId, texto);
        setAviso(r.ok ? { texto: "Limite salvo.", erro: false } : { texto: r.erro, erro: true });
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  const padrao =
    padraoDoPlano === null ? "sem limite" : `${new Intl.NumberFormat("pt-BR").format(padraoDoPlano)} por mês`;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
        Limite de respostas da IA por mês
        <input
          name="tetoRespostasIa"
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Do plano"
          className={CLASSE_DO_CAMPO}
        />
      </label>
      <p className="text-fluid-xs text-apoio">
        Em branco, vale o do plano ({padrao}). No limite, a IA para de responder os clientes deste grupo e a equipe
        atende pelo painel até o dia 1º.
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
          {pendente ? "Salvando…" : "Salvar limite"}
        </button>
      </div>
    </form>
  );
}
