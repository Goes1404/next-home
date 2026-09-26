"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { salvarPreferenciasDoResumo } from "./resumoAcoes";

const HORAS = [6, 7, 8, 9, 10, 11];

/**
 * Quando o resumo do dia chega no WhatsApp (0121). A hora é a de ABERTURA:
 * se o número estiver fora do ar nesse minuto, ele sai no primeiro tique
 * seguinte até meio-dia.
 */
export function AjustesDoResumo({ hora, fimDeSemana }: { hora: number; fimDeSemana: boolean }) {
  const [h, setH] = useState(hora);
  const [fds, setFds] = useState(fimDeSemana);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  function salvar() {
    iniciar(async () => {
      try {
        const r = await salvarPreferenciasDoResumo({ hora: h, fimDeSemana: fds });
        if (r.erro) return falhar(r.erro);
        avisar(r.ok!);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="titulo-resumo">
      <h2 id="titulo-resumo" className="text-fluid-base font-bold text-titulo">
        Resumo do dia no WhatsApp
      </h2>
      <p className="text-fluid-xs text-apoio">
        Visitas de hoje, quem espera resposta, leads novos e o placar de ontem, no seu WhatsApp. Só chega
        quando há algo a fazer.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-fluid-sm text-corpo">
          Às
          <select
            value={h}
            onChange={(e) => setH(Number(e.target.value))}
            className="select-seta text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
          >
            {HORAS.map((x) => (
              <option key={x} value={x}>
                {x}h
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-fluid-sm text-corpo">
          <input
            type="checkbox"
            checked={fds}
            onChange={(e) => setFds(e.target.checked)}
            className="h-4 w-4 accent-acento"
          />
          Também sábado e domingo
        </label>
        <button
          type="button"
          onClick={salvar}
          disabled={ocupado || (h === hora && fds === fimDeSemana)}
          className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          {ocupado ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </section>
  );
}
