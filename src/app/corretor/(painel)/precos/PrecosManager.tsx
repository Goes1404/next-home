"use client";

import { useState, useTransition } from "react";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { parsearTabelaTexto } from "@/lib/precos/spreadsheetParser";
import { conciliarPlanilhaComCatalogo } from "@/lib/precos/matchingEngine";
import type { EmpreendimentoSimples, ItemConciliado, LoteHistorico } from "@/lib/precos/types";
import { aplicarLotePrecos, reverterLotePrecos } from "./actions";

interface Props {
  catalogoInicial: EmpreendimentoSimples[];
  historicoInicial: LoteHistorico[];
}

export function PrecosManager({ catalogoInicial, historicoInicial }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<"importar" | "historico">("importar");
  const [textoColado, setTextoColado] = useState("");
  const [itensConciliados, setItensConciliados] = useState<ItemConciliado[]>([]);
  const [nomeLote, setNomeLote] = useState(`Tabela Mensal - ${new Date().toLocaleDateString("pt-BR")}`);
  const [historico, setHistorico] = useState<LoteHistorico[]>(historicoInicial);
  const [feedback, setFeedback] = useState<{ tipo: "sucesso" | "erro"; msg: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Processa o texto colado ou arquivo carregado
  function processarConteudo(conteudo: string) {
    setFeedback(null);
    const linhas = parsearTabelaTexto(conteudo);
    if (linhas.length === 0) {
      setFeedback({
        tipo: "erro",
        msg: "Nenhum dado válido de imóvel e preço foi identificado. Cole colunas do Excel ou digite no formato: 'Nome do Imóvel  Preço'.",
      });
      setItensConciliados([]);
      return;
    }

    const conciliados = conciliarPlanilhaComCatalogo(linhas, catalogoInicial);
    setItensConciliados(conciliados);
  }

  // Upload de arquivo CSV / TXT
  function onUploadArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setTextoColado(text);
      processarConteudo(text);
    };
    reader.readAsText(file, "UTF-8");
  }

  // Alterna seleção individual
  function toggleSelecionado(idTemp: string) {
    setItensConciliados((prev) =>
      prev.map((it) => (it.idTemp === idTemp ? { ...it, selecionado: !it.selecionado } : it)),
    );
  }

  // Seleciona ou desmarca todos
  function toggleTodos(selecionar: boolean) {
    setItensConciliados((prev) =>
      prev.map((it) => (it.matchStatus !== "nao_encontrado" ? { ...it, selecionado: selecionar } : it)),
    );
  }

  // Altera associação manual de empreendimento
  function associarManualmente(idTemp: string, empreendimentoId: string) {
    const emp = catalogoInicial.find((e) => e.id === empreendimentoId);
    if (!emp) return;

    setItensConciliados((prev) =>
      prev.map((it) => {
        if (it.idTemp !== idTemp) return it;
        const precoAtual = emp.precoAtual;
        const precoNovo = it.precoNovo;
        let diferencaReais = null;
        let variacaoPercentual = null;
        if (precoAtual && precoAtual > 0) {
          diferencaReais = precoNovo - precoAtual;
          variacaoPercentual = parseFloat((((precoNovo - precoAtual) / precoAtual) * 100).toFixed(2));
        }

        return {
          ...it,
          empreendimentoId: emp.id,
          nomeEmpreendimento: emp.nome,
          slugEmpreendimento: emp.slug,
          cidade: emp.cidade,
          bairro: emp.bairro,
          precoAtual,
          diferencaReais,
          variacaoPercentual,
          matchStatus: "exato",
          selecionado: true,
        };
      }),
    );
  }

  // Submete o lote
  function handleAplicarLote() {
    startTransition(async () => {
      setFeedback(null);
      const res = await aplicarLotePrecos(nomeLote, itensConciliados);
      if (res.ok) {
        setFeedback({
          tipo: "sucesso",
          msg: `🎉 Sucesso! ${res.totalAlterados} imóveis foram atualizados no catálogo e o site já está com os novos valores!`,
        });
        setItensConciliados([]);
        setTextoColado("");
      } else {
        setFeedback({ tipo: "erro", msg: res.erro || "Falha ao aplicar reajuste." });
      }
    });
  }

  // Reverte um lote
  function handleReverter(loteId: string) {
    if (!confirm("Tem certeza que deseja restaurar os preços anteriores deste lote?")) return;

    startTransition(async () => {
      const res = await reverterLotePrecos(loteId);
      if (res.ok) {
        setHistorico((prev) =>
          prev.map((l) => (l.id === loteId ? { ...l, status: "revertido", revertidoEm: new Date().toISOString() } : l)),
        );
        setFeedback({ tipo: "sucesso", msg: "Lote revertido com sucesso! Os preços anteriores foram restaurados." });
      } else {
        setFeedback({ tipo: "erro", msg: res.erro || "Falha ao reverter lote." });
      }
    });
  }

  const itensSelecionadosCount = itensConciliados.filter((i) => i.selecionado && i.empreendimentoId).length;
  const aumentoCount = itensConciliados.filter((i) => i.diferencaReais !== null && i.diferencaReais > 0).length;
  const reducaoCount = itensConciliados.filter((i) => i.diferencaReais !== null && i.diferencaReais < 0).length;
  const naoEncontradosCount = itensConciliados.filter((i) => i.matchStatus === "nao_encontrado").length;

  return (
    <div className="space-y-6">
      {/* Abas */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setAbaAtiva("importar")}
          className={`px-4 py-2 text-fluid-sm font-medium rounded-lg transition-colors ${
            abaAtiva === "importar"
              ? "bg-brand-500 text-white"
              : "text-mist-400 hover:text-white hover:bg-white/5"
          }`}
        >
          📥 Atualizar Preços em Massa
        </button>
        <button
          onClick={() => setAbaAtiva("historico")}
          className={`px-4 py-2 text-fluid-sm font-medium rounded-lg transition-colors ${
            abaAtiva === "historico"
              ? "bg-brand-500 text-white"
              : "text-mist-400 hover:text-white hover:bg-white/5"
          }`}
        >
          🕒 Histórico de Reajustes ({historico.length})
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-fluid-sm ${
            feedback.tipo === "sucesso"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {abaAtiva === "importar" ? (
        <div className="space-y-6">
          {/* Caixa de Entrada (Paste ou Upload) */}
          <div className="rounded-2xl border border-white/10 bg-ink-900/60 p-5 backdrop-blur">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-fluid-base font-semibold text-mist-50">
                  1. Cole a Tabela do Excel ou Envie o Arquivo
                </h3>
                <p className="text-fluid-xs text-mist-400">
                  Copie as colunas de <strong>Nome do Imóvel</strong> e <strong>Novo Valor</strong> do Excel / Google Sheets e cole abaixo.
                </p>
              </div>

              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-fluid-xs font-medium text-mist-200 transition-colors">
                <span>📁 Carregar Arquivo (.csv / .txt)</span>
                <input type="file" accept=".csv,.txt,.tsv" onChange={onUploadArquivo} className="hidden" />
              </label>
            </div>

            <textarea
              rows={4}
              value={textoColado}
              onChange={(e) => {
                setTextoColado(e.target.value);
                processarConteudo(e.target.value);
              }}
              placeholder={`Exemplo de conteúdo copiado do Excel:\nResidencial Alphaville 1\tR$ 1.550.000\nEdifício Panorama\tR$ 890.000\nReserva Tamboré\tR$ 2.400.000`}
              className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-3 font-mono text-fluid-xs text-mist-200 placeholder:text-mist-600 focus:border-brand-400 focus:outline-none"
            />

            {textoColado && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setTextoColado("");
                    setItensConciliados([]);
                  }}
                  className="text-fluid-xs text-mist-500 hover:text-mist-300"
                >
                  Limpar tabela
                </button>
              </div>
            )}
          </div>

          {/* Preview & Conciliação */}
          {itensConciliados.length > 0 && (
            <div className="space-y-4">
              {/* Cards de Métricas do Lote */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/10 bg-ink-900/40 p-3">
                  <span className="text-fluid-xs text-mist-400">Total Identificados</span>
                  <p className="text-fluid-lg font-bold text-mist-50">{itensConciliados.length}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <span className="text-fluid-xs text-emerald-400">Com Aumento (Reajuste)</span>
                  <p className="text-fluid-lg font-bold text-emerald-300">{aumentoCount}</p>
                </div>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
                  <span className="text-fluid-xs text-sky-400">Com Redução (Promoção)</span>
                  <p className="text-fluid-lg font-bold text-sky-300">{reducaoCount}</p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <span className="text-fluid-xs text-amber-400">Não Encontrados</span>
                  <p className="text-fluid-lg font-bold text-amber-300">{naoEncontradosCount}</p>
                </div>
              </div>

              {/* Tabela de Diff */}
              <div className="rounded-2xl border border-white/10 bg-ink-900/60 overflow-hidden backdrop-blur">
                <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-ink-950/40">
                  <div className="flex items-center gap-3">
                    <h3 className="text-fluid-base font-semibold text-mist-50">
                      2. Preview Comparativo dos Novos Preços
                    </h3>
                    <span className="text-fluid-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-medium">
                      {itensSelecionadosCount} selecionados
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTodos(true)}
                      className="text-fluid-xs text-brand-400 hover:text-brand-300 font-medium"
                    >
                      Selecionar Todos
                    </button>
                    <span className="text-mist-600">·</span>
                    <button
                      type="button"
                      onClick={() => toggleTodos(false)}
                      className="text-fluid-xs text-mist-400 hover:text-mist-300 font-medium"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-fluid-xs">
                    <thead className="border-b border-white/10 bg-ink-950/70 text-mist-400 uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="p-3.5 w-10 text-center">✓</th>
                        <th className="p-3.5">Nome na Planilha</th>
                        <th className="p-3.5">Imóvel no Catálogo</th>
                        <th className="p-3.5 text-right">Preço Atual</th>
                        <th className="p-3.5 text-right">Novo Preço</th>
                        <th className="p-3.5 text-right">Variação</th>
                        <th className="p-3.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {itensConciliados.map((item) => {
                        const ehAumento = item.diferencaReais !== null && item.diferencaReais > 0;
                        const ehReducao = item.diferencaReais !== null && item.diferencaReais < 0;

                        return (
                          <tr
                            key={item.idTemp}
                            className={`transition-colors ${
                              item.selecionado ? "bg-white/[0.02]" : "opacity-50"
                            } hover:bg-white/[0.04]`}
                          >
                            <td className="p-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={item.selecionado}
                                disabled={item.matchStatus === "nao_encontrado" && !item.empreendimentoId}
                                onChange={() => toggleSelecionado(item.idTemp)}
                                className="rounded border-white/20 bg-ink-950 text-brand-500 focus:ring-brand-400 h-4 w-4 cursor-pointer"
                              />
                            </td>

                            <td className="p-3.5 text-mist-300 font-sans font-medium">
                              {item.linhaOriginal.textoNome}
                            </td>

                            <td className="p-3.5 font-sans">
                              {item.matchStatus === "nao_encontrado" ? (
                                <select
                                  onChange={(e) => associarManualmente(item.idTemp, e.target.value)}
                                  defaultValue=""
                                  className="w-full rounded-lg border border-amber-500/40 bg-ink-950 px-2 py-1 text-fluid-xs text-amber-200"
                                >
                                  <option value="" disabled>
                                    ⚠️ Selecione para vincular...
                                  </option>
                                  {catalogoInicial.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.nome} ({emp.cidade})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-mist-100 font-medium">{item.nomeEmpreendimento}</span>
                              )}
                            </td>

                            <td className="p-3.5 text-right text-mist-400">
                              {formatarMoedaBRL(item.precoAtual)}
                            </td>

                            <td className="p-3.5 text-right text-mist-50 font-semibold">
                              {formatarMoedaBRL(item.precoNovo)}
                            </td>

                            <td className="p-3.5 text-right">
                              {item.diferencaReais !== null && item.variacaoPercentual !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 font-semibold ${
                                    ehAumento ? "text-emerald-400" : ehReducao ? "text-sky-400" : "text-mist-500"
                                  }`}
                                >
                                  {ehAumento ? "▲ +" : ehReducao ? "▼ " : "— "}
                                  {Math.abs(item.variacaoPercentual)}%
                                </span>
                              ) : (
                                <span className="text-mist-600">—</span>
                              )}
                            </td>

                            <td className="p-3.5 text-center">
                              {item.matchStatus === "exato" && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  Exato
                                </span>
                              )}
                              {item.matchStatus === "sugerido" && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                  Sugerido
                                </span>
                              )}
                              {item.matchStatus === "nao_encontrado" && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Não Encontrado
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Barra de Ação de Confirmação */}
                <div className="p-4 bg-ink-950/80 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-80">
                    <label className="text-fluid-xs text-mist-400 block mb-1">Identificação do Lote:</label>
                    <input
                      type="text"
                      value={nomeLote}
                      onChange={(e) => setNomeLote(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-1.5 text-fluid-xs text-mist-200"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isPending || itensSelecionadosCount === 0}
                    onClick={handleAplicarLote}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-semibold text-fluid-sm transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Atualizando Catálogo...</span>
                      </>
                    ) : (
                      <span>🚀 Confirmar e Atualizar Catálogo ({itensSelecionadosCount} imóveis)</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Aba Histórico de Reajustes */
        <div className="rounded-2xl border border-white/10 bg-ink-900/60 overflow-hidden backdrop-blur">
          <div className="p-4 border-b border-white/10 bg-ink-950/40">
            <h3 className="text-fluid-base font-semibold text-mist-50">
              Histórico de Tabelas Mensais Aplicadas
            </h3>
            <p className="text-fluid-xs text-mist-400">
              Auditoria de todos os lotes de preços atualizados com opção de rollback (desfazer reajuste).
            </p>
          </div>

          {historico.length === 0 ? (
            <div className="p-8 text-center text-mist-500 text-fluid-sm">
              Nenhum lote de reajuste foi aplicado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-fluid-xs">
                <thead className="border-b border-white/10 bg-ink-950/70 text-mist-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3.5">Nome do Lote</th>
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Gestor</th>
                    <th className="p-3.5 text-center">Total de Imóveis</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {historico.map((lote) => (
                    <tr key={lote.id} className="hover:bg-white/[0.02]">
                      <td className="p-3.5 font-medium text-mist-100">{lote.nomeLote}</td>
                      <td className="p-3.5 text-mist-400">
                        {new Date(lote.criadoEm).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-3.5 text-mist-300">{lote.gestorNome || "Gestor"}</td>
                      <td className="p-3.5 text-center text-mist-200 font-semibold">{lote.totalImoveis}</td>
                      <td className="p-3.5 text-center">
                        {lote.status === "aplicado" ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Aplicado
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Revertido
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        {lote.status === "aplicado" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleReverter(lote.id)}
                            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-fluid-xs font-medium transition-colors cursor-pointer"
                          >
                            ↩️ Desfazer Lote
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
