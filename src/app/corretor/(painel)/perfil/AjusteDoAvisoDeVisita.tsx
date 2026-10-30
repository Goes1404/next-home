"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { ANTECEDENCIAS_DO_LEMBRETE_MIN, textoDaAntecedencia } from "@/lib/notificacoes/regrasDeVisita";
import { salvarAntecedenciaDoAvisoDeVisita } from "./resumoAcoes";

/**
 * Quanto antes da visita o lembrete chega (0250, spec 4.7; padrão 1 hora).
 * Vale para a notificação no celular e, com o número central ligado na
 * imobiliária, para o WhatsApp. Sem a coluna no banco a tela não mostra o
 * ajuste (a página decide).
 */
export function AjusteDoAvisoDeVisita({ minutos }: { minutos: number }) {
  const [min, setMin] = useState(minutos);
  const [salvo, setSalvo] = useState(minutos);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  function salvar() {
    iniciar(async () => {
      try {
        const r = await salvarAntecedenciaDoAvisoDeVisita(min);
        if (r.erro) return falhar(r.erro);
        setSalvo(min);
        avisar(r.ok!);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="titulo-aviso-de-visita">
      <h2 id="titulo-aviso-de-visita" className="text-fluid-base font-bold text-titulo">
        Lembrete de visita
      </h2>
      <p className="text-fluid-xs text-apoio">
        Antes de cada visita marcada, um lembrete com o nome do cliente e a hora, no seu celular.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-fluid-sm text-corpo">
          Chegar
          <select
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="select-seta text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
          >
            {ANTECEDENCIAS_DO_LEMBRETE_MIN.map((x) => (
              <option key={x} value={x}>
                {textoDaAntecedencia(x)}
              </option>
            ))}
          </select>
          antes
        </label>
        <button
          type="button"
          onClick={salvar}
          disabled={ocupado || min === salvo}
          className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          {ocupado ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </section>
  );
}
