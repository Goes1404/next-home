"use client";

import { useState, useTransition } from "react";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { parsearTabelaTexto } from "@/lib/precos/spreadsheetParser";
import { conciliarPlanilhaComCatalogo } from "@/lib/precos/matchingEngine";
import type { EmpreendimentoSimples, ItemConciliado, LoteHistorico } from "@/lib/precos/types";
import { aplicarLotePrecos, reverterLotePrecos } from "./actions";
import { Download, AlertTriangle, Rocket, PartyPopper, Clock, Folder, Check } from 'lucide-react';

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
          msg: ` <PartyPopper className="inline-block w-5 h-5 align-text-bottom mr-1" />  Sucesso! ${res.totalAlterados} imóveis foram atualizados no catálogo e o site já está com os novos valores!`,
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
      <div className="flex items-center gap-2 border-b border-linha pb-3">
        <button
          onClick={() => setAbaAtiva("importar")}
          className={`px-4 py-2 text-fluid-sm font-medium rounded-lg transition-colors ${
            abaAtiva === "importar"
              ? "bg-acento text-white"
              : "text-apoio hover:text-titulo hover:bg-vidro"
          }`}
        >
           <Download className="inline-block w-5 h-5 align-text-bottom mr-1" />  Atualizar Preços em Massa
        </button>
        <button
          onClick={() => setAbaAtiva("historico")}
          className={`px-4 py-2 text-fluid-sm font-medium rounded-lg transition-colors ${
            abaAtiva === "historico"
              ? "bg-acento text-white"
              : "text-apoio hover:text-titulo hover:bg-vidro"
          }`}
        >
           <Clock className="inline-block w-5 h-5 align-text-bottom mr-1" />  Histórico de Reajustes ({historico.length})
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-fluid-sm ${
            feedback.tipo === "sucesso"
              ? "bg-ok-lavado border border-ok-linha text-ok"
              : "bg-perigo-lavado border border-perigo-linha text-perigo"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {abaAtiva === "importar" ? (
        <div className="space-y-6">
          {/* Caixa de Entrada (Paste ou Upload) */}
          <div className="rounded-2xl border border-linha bg-superficie p-5 backdrop-blur">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-fluid-base font-semibold text-titulo">
                  1. Cole a Tabela do Excel ou Envie o Arquivo
                </h3>
                <p className="text-fluid-xs text-apoio">
                  Copie as colunas de <strong>Nome do Imóvel</strong> e <strong>Novo Valor</strong> do Excel / Google Sheets e cole abaixo.
                </p>
              </div>

              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-vidro-forte hover:bg-vidro-mais text-fluid-xs font-medium text-corpo transition-colors">
                <span> <Folder className="inline-block w-5 h-5 align-text-bottom mr-1" />  Carregar Arquivo (.csv / .txt)</span>
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
              className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-3 font-mono text-fluid-xs text-corpo placeholder:text-tenue focus:border-acento focus:outline-none"
            />

            {textoColado && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setTextoColado("");
                    setItensConciliados([]);
                  }}
                  className="text-fluid-xs text-tenue hover:text-corpo"
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
                <div className="rounded-xl border border-linha bg-superficie p-3">
                  <span className="text-fluid-xs text-apoio">Total Identificados</span>
                  <p className="text-fluid-lg font-bold text-titulo">{itensConciliados.length}</p>
                </div>
                <div className="rounded-xl border border-ok-linha bg-ok-lavado p-3">
                  <span className="text-fluid-xs text-ok">Com Aumento (Reajuste)</span>
                  <p className="text-fluid-lg font-bold text-ok">{aumentoCount}</p>
                </div>
                <div className="rounded-xl border border-info-linha bg-info-lavado p-3">
                  <span className="text-fluid-xs text-info">Com Redução (Promoção)</span>
                  <p className="text-fluid-lg font-bold text-info">{reducaoCount}</p>
                </div>
                <div className="rounded-xl border border-alerta-linha bg-alerta-lavado p-3">
                  <span className="text-fluid-xs text-alerta">Não Encontrados</span>
                  <p className="text-fluid-lg font-bold text-alerta">{naoEncontradosCount}</p>
                </div>
              </div>

              {/* Tabela de Diff */}
              <div className="rounded-2xl border border-linha bg-superficie overflow-hidden backdrop-blur">
                <div className="p-4 border-b border-linha flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-elevado">
                  <div className="flex items-center gap-3">
                    <h3 className="text-fluid-base font-semibold text-titulo">
                      2. Preview Comparativo dos Novos Preços
                    </h3>
                    <span className="text-fluid-xs px-2 py-0.5 rounded-full bg-acento-lavado text-acento-suave font-medium">
                      {itensSelecionadosCount} selecionados
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleTodos(true)}
                      className="text-fluid-xs text-acento-suave hover:text-acento-suave font-medium"
                    >
                      Selecionar Todos
                    </button>
                    <span className="text-tenue">·</span>
                    <button
                      type="button"
                      onClick={() => toggleTodos(false)}
                      className="text-fluid-xs text-apoio hover:text-corpo font-medium"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-fluid-xs">
                    <thead className="border-b border-linha bg-fundo/70 text-apoio uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="p-3.5 w-10 text-center"> <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> </th>
                        <th className="p-3.5">Nome na Planilha</th>
                        <th className="p-3.5">Imóvel no Catálogo</th>
                        <th className="p-3.5 text-right">Preço Atual</th>
                        <th className="p-3.5 text-right">Novo Preço</th>
                        <th className="p-3.5 text-right">Variação</th>
                        <th className="p-3.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linha font-mono">
                      {itensConciliados.map((item) => {
                        const ehAumento = item.diferencaReais !== null && item.diferencaReais > 0;
                        const ehReducao = item.diferencaReais !== null && item.diferencaReais < 0;

                        return (
                          <tr
                            key={item.idTemp}
                            className={`transition-colors ${
                              item.selecionado ? "bg-vidro" : "opacity-50"
                            } hover:bg-vidro`}
                          >
                            <td className="p-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={item.selecionado}
                                disabled={item.matchStatus === "nao_encontrado" && !item.empreendimentoId}
                                onChange={() => toggleSelecionado(item.idTemp)}
                                className="rounded border-linha-forte bg-campo text-acento-suave focus:ring-acento h-4 w-4 cursor-pointer"
                              />
                            </td>

                            <td className="p-3.5 text-corpo font-sans font-medium">
                              {item.linhaOriginal.textoNome}
                            </td>

                            <td className="p-3.5 font-sans">
                              {item.matchStatus === "nao_encontrado" ? (
                                <select
                                  onChange={(e) => associarManualmente(item.idTemp, e.target.value)}
                                  defaultValue=""
                                  className="w-full rounded-lg border border-alerta-linha bg-campo px-2 py-1 text-fluid-xs text-alerta"
                                >
                                  <option value="" disabled>
                                     <AlertTriangle className="inline-block w-5 h-5 align-text-bottom mr-1" />  Selecione para vincular...
                                  </option>
                                  {catalogoInicial.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.nome} ({emp.cidade})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-titulo font-medium">{item.nomeEmpreendimento}</span>
                              )}
                            </td>

                            <td className="p-3.5 text-right text-apoio">
                              {formatarMoedaBRL(item.precoAtual)}
                            </td>

                            <td className="p-3.5 text-right text-titulo font-semibold">
                              {formatarMoedaBRL(item.precoNovo)}
                            </td>

                            <td className="p-3.5 text-right">
                              {item.diferencaReais !== null && item.variacaoPercentual !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 font-semibold ${
                                    ehAumento ? "text-ok" : ehReducao ? "text-info" : "text-tenue"
                                  }`}
                                >
                                  {ehAumento ? "▲ +" : ehReducao ? "▼ " : "— "}
                                  {Math.abs(item.variacaoPercentual)}%
                                </span>
                              ) : (
                                <span className="text-tenue">—</span>
                              )}
                            </td>

                            <td className="p-3.5 text-center">
                              {item.matchStatus === "exato" && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-ok-lavado text-ok border border-ok-linha">
                                  Exato
                                </span>
                              )}
                              {item.matchStatus === "sugerido" && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-info-lavado text-info border border-info-linha">
                                  Sugerido
                                </span>
                              )}
                              {item.matchStatus === "nao_encontrado" && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-alerta-lavado text-alerta border border-alerta-linha">
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
                <div className="p-4 bg-fundo/80 border-t border-linha flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="w-full sm:w-80">
                    <label className="text-fluid-xs text-apoio block mb-1">Identificação do Lote:</label>
                    <input
                      type="text"
                      value={nomeLote}
                      onChange={(e) => setNomeLote(e.target.value)}
                      className="w-full rounded-lg border border-linha-forte bg-superficie px-3 py-1.5 text-fluid-xs text-corpo"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isPending || itensSelecionadosCount === 0}
                    onClick={handleAplicarLote}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-acento hover:bg-acento-hover disabled:opacity-50 text-white font-semibold text-fluid-sm transition-all shadow-lg shadow-acento/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-titulo" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Atualizando Catálogo...</span>
                      </>
                    ) : (
                      <span> <Rocket className="inline-block w-5 h-5 align-text-bottom mr-1" />  Confirmar e Atualizar Catálogo ({itensSelecionadosCount} imóveis)</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Aba Histórico de Reajustes */
        <div className="rounded-2xl border border-linha bg-superficie overflow-hidden backdrop-blur">
          <div className="p-4 border-b border-linha bg-elevado">
            <h3 className="text-fluid-base font-semibold text-titulo">
              Histórico de Tabelas Mensais Aplicadas
            </h3>
            <p className="text-fluid-xs text-apoio">
              Auditoria de todos os lotes de preços atualizados com opção de rollback (desfazer reajuste).
            </p>
          </div>

          {historico.length === 0 ? (
            <div className="p-8 text-center text-tenue text-fluid-sm">
              Nenhum lote de reajuste foi aplicado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-fluid-xs">
                <thead className="border-b border-linha bg-fundo/70 text-apoio uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3.5">Nome do Lote</th>
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Gestor</th>
                    <th className="p-3.5 text-center">Total de Imóveis</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {historico.map((lote) => (
                    <tr key={lote.id} className="hover:bg-vidro">
                      <td className="p-3.5 font-medium text-titulo">{lote.nomeLote}</td>
                      <td className="p-3.5 text-apoio">
                        {new Date(lote.criadoEm).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-3.5 text-corpo">{lote.gestorNome || "Gestor"}</td>
                      <td className="p-3.5 text-center text-corpo font-semibold">{lote.totalImoveis}</td>
                      <td className="p-3.5 text-center">
                        {lote.status === "aplicado" ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-ok-lavado text-ok border border-ok-linha">
                            Aplicado
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-perigo-lavado text-perigo border border-perigo-linha">
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
                            className="px-3 py-1 rounded-lg bg-perigo-lavado hover:opacity-85 text-perigo border border-perigo-linha text-fluid-xs font-medium transition-colors cursor-pointer"
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
