"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CartaoLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { EnviarEmMassa } from "./EnviarEmMassa";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil, type Lead, type TemplateMensagem } from "@/lib/types";

type Filtro = "todos" | "novos" | "negociando" | "frios";

export function ListaLeads({
  leads,
  gestor,
  equipe,
  templates,
  nomeCorretor,
  whatsappCorretor,
}: {
  leads: Lead[];
  gestor: boolean;
  equipe: { id: string; nome: string }[];
  templates: TemplateMensagem[];
  nomeCorretor: string;
  whatsappCorretor: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [corretorFiltro, setCorretorFiltro] = useState("");
  const [etapaFiltro, setEtapaFiltro] = useState<EtapaFunil | "">("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberto, setModalAberto] = useState(false);

  const leadsFiltrados = useMemo(() => {
    return leads.filter((lead) => {
      if (filtro === "novos" && !["novo", "primeiro_contato"].includes(lead.etapa)) return false;
      if (
        filtro === "negociando" &&
        !["visita_agendada", "proposta_enviada", "negociacao"].includes(lead.etapa)
      )
        return false;
      if (filtro === "frios" && !["perdido", "fechado"].includes(lead.etapa)) return false;

      if (corretorFiltro && lead.corretor?.id !== corretorFiltro) return false;
      if (etapaFiltro && lead.etapa !== etapaFiltro) return false;

      if (dataDe && lead.criadoEm < dataDe) return false;
      if (dataAte && lead.criadoEm > `${dataAte}T23:59:59`) return false;

      if (busca) {
        const alvo = `${lead.nome} ${lead.telefone ?? ""}`.toLowerCase();
        if (!alvo.includes(busca.toLowerCase())) return false;
      }

      return true;
    });
  }, [leads, filtro, corretorFiltro, etapaFiltro, dataDe, dataAte, busca]);

  const todosFiltradosSelecionados =
    leadsFiltrados.length > 0 && leadsFiltrados.every((l) => selecionados.has(l.id));

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodos() {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (todosFiltradosSelecionados) {
        leadsFiltrados.forEach((l) => novo.delete(l.id));
      } else {
        leadsFiltrados.forEach((l) => novo.add(l.id));
      }
      return novo;
    });
  }

  const leadsSelecionados = leads.filter((l) => selecionados.has(l.id));

  return (
    <div>
      {leads.length > 0 && (
        <div className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {(["todos", "novos", "negociando", "frios"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filtro === f
                  ? "bg-brand-500 text-white"
                  : "bg-ink-900/50 text-mist-400 hover:bg-ink-800 hover:text-mist-200"
              }`}
            >
              {f === "todos" && "Todos"}
              {f === "novos" && "Novos/Quentes"}
              {f === "negociando" && "Em Negociação"}
              {f === "frios" && "Frios/Concluídos"}
            </button>
          ))}
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {gestor && (
            <select
              value={corretorFiltro}
              onChange={(e) => setCorretorFiltro(e.target.value)}
              className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
            >
              <option value="">Todos os corretores</option>
              {equipe.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          <select
            value={etapaFiltro}
            onChange={(e) => setEtapaFiltro(e.target.value as EtapaFunil | "")}
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          >
            <option value="">Todas as etapas</option>
            {ETAPAS_FUNIL.map((etapa) => (
              <option key={etapa} value={etapa}>
                {ETAPA_LABEL[etapa]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dataDe}
            onChange={(e) => setDataDe(e.target.value)}
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          />
          <input
            type="date"
            value={dataAte}
            onChange={(e) => setDataAte(e.target.value)}
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="text-fluid-xs rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200 sm:col-span-2 lg:col-span-4"
          />
        </div>
      )}

      {leadsFiltrados.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-fluid-xs text-mist-400">
          <input type="checkbox" checked={todosFiltradosSelecionados} onChange={alternarSelecaoTodos} />
          Selecionar todos ({leadsFiltrados.length})
        </label>
      )}

      {leads.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <p className="text-fluid-sm text-mist-300">
            Nenhum contato ainda. Compartilhe seu link pessoal — todo formulário preenchido a
            partir dele chega aqui com seu nome.
          </p>
          <Link
            href="/corretor/links"
            className="text-fluid-sm mt-3 inline-block font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Pegar meus links →
          </Link>
        </div>
      ) : leadsFiltrados.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6 text-center">
          <p className="text-fluid-sm text-mist-400">Nenhum lead encontrado neste filtro.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4 pb-24">
          {leadsFiltrados.map((lead) => (
            <CartaoLead
              key={lead.id}
              lead={lead}
              mostrarDono={gestor}
              selecionavel
              selecionado={selecionados.has(lead.id)}
              aoAlternarSelecao={() => alternarSelecao(lead.id)}
            />
          ))}
        </div>
      )}

      {selecionados.size > 0 && !modalAberto && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/95 p-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-fluid-sm text-mist-200">{selecionados.size} selecionado(s)</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="text-fluid-sm rounded-lg border border-white/15 px-4 py-2 text-mist-300"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setModalAberto(true)}
                className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white"
              >
                Enviar mensagem
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <EnviarEmMassa
          leadsSelecionados={leadsSelecionados}
          templates={templates}
          nomeCorretor={nomeCorretor}
          whatsappCorretor={whatsappCorretor}
          onFechar={() => {
            setModalAberto(false);
            setSelecionados(new Set());
          }}
        />
      )}
    </div>
  );
}
