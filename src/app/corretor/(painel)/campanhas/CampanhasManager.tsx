"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { Empreendimento, TemplateMensagem } from "@/lib/types";
import { HistoricoCampanhas } from "./_componentes/HistoricoCampanhas";
import { NovaCampanha, type InicialDaLista } from "./_componentes/NovaCampanha";
import { StatusFila } from "./_componentes/StatusFila";
import { listarCampanhas, statusDisparo, type CampanhaListada, type StatusDisparo } from "./acoes";

/**
 * A casca da tela de listas (roadmap F4; remodelada em 31/10/2026).
 *
 * Ordem do que o corretor procura ao abrir: as mensagens estão saindo?
 * (status) → montar uma lista (assistente, aberto só quando há o que montar)
 * → como foram as listas (histórico). As sugestões são atalhos para montar,
 * então ficam fora de cena com o assistente aberto. Quando uma lista muda, a
 * casca recarrega o histórico E o status da fila, para os dois nunca
 * contarem histórias diferentes.
 */

interface Props {
  empreendimentos: Empreendimento[];
  campanhasIniciais: CampanhaListada[];
  statusInicial: StatusDisparo | null;
  /** Pré-preenchimento vindo de "leads que combinam", listas sugeridas, repetir ou rascunho. */
  inicial?: InicialDaLista;
  modelos: TemplateMensagem[];
  corretor: { nome: string; whatsapp: string };
  /** O assistente nasce aberto (veio para montar, ou não há lista nenhuma). */
  abrirAssistente?: boolean;
  /** As listas sugeridas, montadas no servidor. */
  sugestoes?: React.ReactNode;
}

export function CampanhasManager({
  empreendimentos,
  campanhasIniciais,
  statusInicial,
  inicial,
  modelos,
  corretor,
  abrirAssistente = false,
  sugestoes,
}: Props) {
  const [campanhas, setCampanhas] = useState<CampanhaListada[]>(campanhasIniciais);
  const [status, setStatus] = useState<StatusDisparo | null>(statusInicial);
  const [montando, setMontando] = useState(abrirAssistente);
  const { avisar } = useAvisos();
  const router = useRouter();

  async function recarregar() {
    const [listas, novoStatus] = await Promise.all([listarCampanhas(), statusDisparo()]);
    setCampanhas(listas);
    setStatus(novoStatus);
  }

  function fecharAssistente() {
    setMontando(false);
    // Tira da URL o que abriu o assistente (?nova, ?repetir, ?leads…), para
    // o "Nova lista" do cabeçalho voltar a abrir e o recarregar não reabrir.
    router.replace("/corretor/campanhas", { scroll: false });
  }

  const numeroConectado = status?.statusConexao === "conectado";

  return (
    <div className="space-y-6">
      <StatusFila key={JSON.stringify(status)} statusInicial={status} aoMudar={recarregar} />

      {montando ? (
        <NovaCampanha
          empreendimentos={empreendimentos}
          inicial={inicial}
          modelos={modelos}
          numeroConectado={numeroConectado}
          corretor={corretor}
          aoFechar={campanhas.length > 0 ? fecharAssistente : undefined}
          aoCriar={(campanha, aviso) => {
            setCampanhas((prev) => [campanha, ...prev.filter((c) => c.status !== "rascunho" || c.id !== campanha.id)]);
            avisar(aviso);
            void recarregar();
            fecharAssistente();
          }}
        />
      ) : (
        sugestoes
      )}

      <HistoricoCampanhas campanhas={campanhas} aoMudar={recarregar} aoNovaLista={() => setMontando(true)} />
    </div>
  );
}
