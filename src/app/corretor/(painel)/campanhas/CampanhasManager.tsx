"use client";

import { useState } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { Empreendimento, TemplateMensagem } from "@/lib/types";
import { HistoricoCampanhas } from "./_componentes/HistoricoCampanhas";
import { NovaCampanha, type InicialDaLista } from "./_componentes/NovaCampanha";
import { StatusFila } from "./_componentes/StatusFila";
import { listarCampanhas, statusDisparo, type CampanhaListada, type StatusDisparo } from "./acoes";

/**
 * A casca da tela de listas (roadmap F4).
 *
 * Três blocos com um papel cada: como está a fila, criar lista nova
 * (assistente de 3 passos) e o que já foi enviado. Quando uma lista muda,
 * a casca recarrega o histórico E o status da fila, para os dois nunca
 * contarem histórias diferentes.
 */

interface Props {
  empreendimentos: Empreendimento[];
  campanhasIniciais: CampanhaListada[];
  statusInicial: StatusDisparo | null;
  /** Pré-preenchimento vindo de "leads que combinam", listas sugeridas, repetir ou rascunho. */
  inicial?: InicialDaLista;
  modelos: TemplateMensagem[];
  temAgenda: boolean;
  corretor: { nome: string; whatsapp: string };
}

export function CampanhasManager({
  empreendimentos,
  campanhasIniciais,
  statusInicial,
  inicial,
  modelos,
  temAgenda,
  corretor,
}: Props) {
  const [campanhas, setCampanhas] = useState<CampanhaListada[]>(campanhasIniciais);
  const [status, setStatus] = useState<StatusDisparo | null>(statusInicial);
  const { avisar } = useAvisos();

  async function recarregar() {
    const [listas, novoStatus] = await Promise.all([listarCampanhas(), statusDisparo()]);
    setCampanhas(listas);
    setStatus(novoStatus);
  }

  const numeroConectado = status?.statusConexao === "conectado";

  return (
    <div className="space-y-6">
      <StatusFila key={JSON.stringify(status)} statusInicial={status} aoMudar={recarregar} />

      <NovaCampanha
        empreendimentos={empreendimentos}
        inicial={inicial}
        modelos={modelos}
        temAgenda={temAgenda}
        numeroConectado={numeroConectado}
        corretor={corretor}
        aoCriar={(campanha, aviso) => {
          setCampanhas((prev) => [campanha, ...prev.filter((c) => c.status !== "rascunho" || c.id !== campanha.id)]);
          avisar(aviso);
          void recarregar();
        }}
      />

      <HistoricoCampanhas
        campanhas={campanhas}
        aoMudar={recarregar}
      />
    </div>
  );
}
