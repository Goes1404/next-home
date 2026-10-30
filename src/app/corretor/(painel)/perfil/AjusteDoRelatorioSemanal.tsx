"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { Interruptor } from "@/app/corretor/(painel)/marketing/impulsionamentos/Interruptor";
import { salvarRelatorioSemanalNoWhatsapp } from "./resumoAcoes";

/**
 * O resumo da semana no WhatsApp, só para o gestor (0246, 29/10/2026). Salva
 * na hora; se falhar, o interruptor volta.
 */
export function AjusteDoRelatorioSemanal({ ligado }: { ligado: boolean }) {
  const [marcado, setMarcado] = useState(ligado);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const mudar = (novo: boolean) => {
    setMarcado(novo);
    iniciar(async () => {
      try {
        const r = await salvarRelatorioSemanalNoWhatsapp(novo);
        if (r.erro) {
          setMarcado(!novo);
          return falhar(r.erro);
        }
        avisar(r.ok!);
      } catch (err) {
        setMarcado(!novo);
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="titulo-relatorio-semanal">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="titulo-relatorio-semanal" className="text-fluid-base font-bold text-titulo">
            Resumo da semana no WhatsApp
          </h2>
          <p className="text-fluid-xs mt-1 text-apoio">
            Toda segunda de manhã: leads, visitas e vendas da equipe contra a semana anterior, e quem está com lead
            parado. Chega no seu WhatsApp e no celular; o e-mail continua igual.
          </p>
        </div>
        <Interruptor ligado={marcado} aoMudar={mudar} rotulo="Resumo da semana no WhatsApp" desativado={ocupado} />
      </div>
    </section>
  );
}
