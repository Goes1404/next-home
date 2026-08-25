"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Rocket, Shield, Sparkles } from "lucide-react";
import type { Empreendimento } from "@/lib/types";
import {
  criarCampanha,
  gerarPreviewCampanha,
  listarLeadsElegiveis,
  type CampanhaListada,
  type FiltroLeadsCampanha,
  type LeadElegivel,
} from "../acoes";

/**
 * Criar campanha em três passos: quem recebe → o que dizer → confirmar.
 *
 * O formulário antigo mostrava tudo de uma vez — título, empreendimento,
 * público, mensagem, preview e dois botões — e o corretor precisava entender
 * o conjunto antes de fazer qualquer coisa (roadmap F4). Agora é uma
 * pergunta por tela, e o passo 3 mostra o único número que importa: para
 * quantas pessoas isso vai.
 */

const PUBLICOS: { valor: FiltroLeadsCampanha; titulo: string; descricao: string }[] = [
  {
    valor: "parados_15d",
    titulo: "Quem esfriou",
    descricao: "Leads sem conversa há mais de 15 dias. É a base que mais responde a reativação.",
  },
  {
    valor: "novos_sem_contato",
    titulo: "Quem acabou de chegar",
    descricao: "Leads na etapa “Novo lead”, que ainda não receberam seu primeiro contato.",
  },
  {
    valor: "todos",
    titulo: "Todos os meus leads",
    descricao: "A carteira inteira. Use com cuidado: mensagem repetida cansa quem já respondeu.",
  },
  {
    valor: "selecionados",
    titulo: "Escolher um por um",
    descricao: "Você marca exatamente quem recebe — busque pelo nome e monte a lista.",
  },
];

/** Minúsculas e sem acento, para a busca achar "João" digitando "joao". */
function chaveBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const MENSAGEM_PADRAO =
  "Olá, {nome}! Tudo bem? Lembrei do seu interesse em Alphaville. Acabou de sair uma condição exclusiva na tabela do {imovel}. Gostaria de receber o book digital?";

export function NovaCampanha({
  empreendimentos,
  aoCriar,
}: {
  empreendimentos: Empreendimento[];
  aoCriar: (campanha: CampanhaListada, aviso: string) => void;
}) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [publico, setPublico] = useState<FiltroLeadsCampanha>("parados_15d");
  const [imovelSlug, setImovelSlug] = useState(empreendimentos[0]?.slug ?? "");
  const [mensagemBase, setMensagemBase] = useState(MENSAGEM_PADRAO);
  const [titulo, setTitulo] = useState("");
  const [exemplos, setExemplos] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, iniciarCriacao] = useTransition();

  // ---- Seleção manual ("Escolher um por um") -------------------------
  // A carteira elegível chega UMA vez, quando a opção é escolhida (~100
  // leads por corretor — diretriz de produto — cabem inteiros na memória;
  // paginar aqui só atrapalharia a busca).
  const [carteira, setCarteira] = useState<LeadElegivel[] | null>(null);
  const [buscaLead, setBuscaLead] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (publico !== "selecionados" || carteira !== null) return;
    let vivo = true;
    listarLeadsElegiveis("selecionados").then((leads) => {
      if (vivo) setCarteira(leads);
    });
    return () => {
      vivo = false;
    };
  }, [publico, carteira]);

  const carteiraFiltrada = useMemo(() => {
    if (!carteira) return [];
    const termo = chaveBusca(buscaLead.trim());
    if (!termo) return carteira;
    return carteira.filter((l) => chaveBusca(l.nome).includes(termo));
  }, [carteira, buscaLead]);

  function alternarLead(id: string) {
    setEscolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const imovel = empreendimentos.find((e) => e.slug === imovelSlug) ?? null;
  const nomeImovel = imovel?.nome ?? "nossos lançamentos em Alphaville";
  const publicoEscolhido = PUBLICOS.find((p) => p.valor === publico)!;
  const selecaoManual = publico === "selecionados";
  const leadIds = selecaoManual ? [...escolhidos] : undefined;
  /** No modo manual, o rótulo carrega o número — é o que o corretor confere. */
  const rotuloPublico = selecaoManual
    ? `${escolhidos.size} lead${escolhidos.size === 1 ? "" : "s"} escolhido${escolhidos.size === 1 ? "" : "s"} a dedo`
    : publicoEscolhido.titulo;

  function verExemplos() {
    setErro(null);
    setGerando(true);
    iniciarCriacao(async () => {
      const resultado = await gerarPreviewCampanha({
        filtro: publico,
        empreendimentoNome: nomeImovel,
        mensagemBase,
        leadIds,
      });
      setGerando(false);

      if ("erro" in resultado) {
        setErro(resultado.erro);
        setExemplos([]);
        return;
      }
      setExemplos(resultado.mensagens);
    });
  }

  function disparar() {
    // Sem título digitado, o nome do imóvel e a data já descrevem a campanha
    // melhor do que um campo vazio bloqueando o envio.
    const nomeCampanha =
      titulo.trim() ||
      `${rotuloPublico} · ${nomeImovel} · ${new Date().toLocaleDateString("pt-BR")}`;

    setErro(null);
    iniciarCriacao(async () => {
      const resultado = await criarCampanha({
        titulo: nomeCampanha,
        empreendimentoId: imovel?.id ?? null,
        empreendimentoNome: nomeImovel,
        filtro: publico,
        mensagemBase,
        leadIds,
      });

      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }

      aoCriar(
        {
          id: resultado.campanhaId,
          titulo: nomeCampanha,
          empreendimentoNome: imovel?.nome ?? null,
          totalLeads: resultado.totalLeads,
          totalEnviados: 0,
          totalRespondidos: 0,
          status: "em_andamento",
          criadoEm: new Date().toISOString(),
        },
        `Lista de transmissão criada para ${resultado.totalLeads} pessoa${resultado.totalLeads === 1 ? "" : "s"}. As mensagens já começaram a sair sozinhas — não precisa clicar em mais nada.`,
      );

      // Volta ao começo para a próxima campanha.
      setPasso(1);
      setTitulo("");
      setExemplos([]);
      setEscolhidos(new Set());
      setBuscaLead("");
    });
  }

  return (
    <section className="border-linha bg-superficie rounded-2xl border p-5 sm:p-6">
      <div className="flex items-baseline gap-2.5">
        <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase tabular-nums">
          Passo {passo} de 3
        </span>
        <h2 className="font-display text-titulo text-lg">
          {passo === 1 && "Quem vai receber?"}
          {passo === 2 && "O que você quer dizer?"}
          {passo === 3 && "Tudo certo?"}
        </h2>
      </div>

      {/* ------------------------------------------------ 1. quem recebe */}
      {passo === 1 && (
        <div className="mt-4 space-y-3">
          {PUBLICOS.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => setPublico(opcao.valor)}
              aria-pressed={publico === opcao.valor}
              className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                publico === opcao.valor
                  ? "border-acento-linha bg-acento-lavado"
                  : "border-linha hover:border-linha-forte"
              }`}
            >
              <p className="text-fluid-sm text-titulo font-medium">{opcao.titulo}</p>
              <p className="text-fluid-xs text-apoio mt-1 leading-snug">{opcao.descricao}</p>
            </button>
          ))}

          {selecaoManual && (
            <div className="border-linha rounded-xl border p-3">
              <input
                type="search"
                value={buscaLead}
                onChange={(e) => setBuscaLead(e.target.value)}
                placeholder="Buscar pelo nome…"
                aria-label="Buscar lead pelo nome"
                className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-lg border px-3.5 focus:outline-none"
              />

              {/* Teto de altura + rolagem própria: a carteira pode ter 100
                  nomes e o passo 1 não pode virar uma página infinita. */}
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {carteira === null && (
                  <p className="text-fluid-xs text-apoio px-1 py-3">Carregando seus leads…</p>
                )}
                {carteira !== null && carteiraFiltrada.length === 0 && (
                  <p className="text-fluid-xs text-apoio px-1 py-3">
                    {carteira.length === 0
                      ? "Nenhum lead com WhatsApp disponível para a lista."
                      : "Ninguém com esse nome."}
                  </p>
                )}
                {carteiraFiltrada.map((lead) => (
                  <label
                    key={lead.id}
                    className="hover:bg-vidro flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={escolhidos.has(lead.id)}
                      onChange={() => alternarLead(lead.id)}
                      className="accent-acento h-4 w-4 shrink-0"
                    />
                    <span className="text-fluid-sm text-titulo min-w-0 truncate">{lead.nome}</span>
                  </label>
                ))}
              </div>

              <p className="text-fluid-xs text-apoio border-linha mt-2 border-t pt-2 tabular-nums">
                {escolhidos.size === 0
                  ? "Marque quem deve receber."
                  : `${escolhidos.size} marcado${escolhidos.size === 1 ? "" : "s"}.`}
              </p>
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <label className="text-fluid-xs text-apoio block" htmlFor="imovel-campanha">
              Sobre qual imóvel?
            </label>
            <select
              id="imovel-campanha"
              value={imovelSlug}
              onChange={(e) => setImovelSlug(e.target.value)}
              className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-12 w-full cursor-pointer rounded-xl border px-3.5 focus:outline-none"
            >
              {empreendimentos.map((emp) => (
                <option key={emp.slug} value={emp.slug}>
                  {emp.nome} ({emp.bairro})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- 2. mensagem */}
      {passo === 2 && (
        <div className="mt-4 space-y-3">
          <p className="text-fluid-xs text-apoio">
            Escreva como você falaria. A IA reescreve cada mensagem com palavras um pouco
            diferentes — mensagens idênticas em massa é o que faz o WhatsApp bloquear números.
          </p>
          <textarea
            rows={4}
            value={mensagemBase}
            onChange={(e) => setMensagemBase(e.target.value)}
            aria-label="Mensagem da lista de transmissão"
            className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento w-full rounded-xl border p-3.5 focus:outline-none"
          />
          <p className="text-fluid-xs text-tenue">
            <code className="bg-chip rounded px-1">{"{nome}"}</code> vira o nome da pessoa e{" "}
            <code className="bg-chip rounded px-1">{"{imovel}"}</code> vira {nomeImovel}.
          </p>

          <button
            type="button"
            onClick={verExemplos}
            disabled={gerando}
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {gerando ? "Gerando…" : "Ver como vai ficar"}
          </button>

          {exemplos.length > 0 && (
            <div className="border-acento-linha bg-acento-lavado space-y-2 rounded-xl border p-4">
              {exemplos.map((msg, i) => (
                <p key={i} className="text-fluid-xs text-corpo leading-relaxed">
                  “{msg}”
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- 3. confirmar */}
      {passo === 3 && (
        <div className="mt-4 space-y-4">
          <dl className="text-fluid-sm space-y-2">
            <div className="flex gap-2">
              <dt className="text-apoio shrink-0">Para:</dt>
              <dd className="text-titulo">{rotuloPublico}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-apoio shrink-0">Sobre:</dt>
              <dd className="text-titulo">{nomeImovel}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-apoio shrink-0">Diz:</dt>
              <dd className="text-corpo min-w-0">“{mensagemBase}”</dd>
            </div>
          </dl>

          <div className="space-y-1.5">
            <label className="text-fluid-xs text-apoio block" htmlFor="titulo-campanha">
              Nome desta lista (opcional — só para você achar depois)
            </label>
            <input
              id="titulo-campanha"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={`${rotuloPublico} · ${nomeImovel}`}
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-12 w-full rounded-xl border px-3.5 focus:outline-none"
            />
          </div>

          <p className="text-fluid-xs text-apoio flex items-start gap-2">
            <Shield aria-hidden className="text-ok mt-0.5 h-4 w-4 shrink-0" />
            As mensagens saem uma a uma, com pausa entre elas e só em horário comercial — é o que
            mantém seu número seguro.
          </p>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-fluid-xs text-alerta mt-3">
          {erro}
        </p>
      )}

      {/* Navegação entre os passos, sempre no mesmo lugar. */}
      <div className="border-linha mt-5 flex items-center justify-between gap-3 border-t pt-4">
        {passo > 1 ? (
          <button
            type="button"
            onClick={() => setPasso((p) => (p === 3 ? 2 : 1))}
            className="text-fluid-sm text-apoio hover:text-titulo flex min-h-11 cursor-pointer items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        ) : (
          <span />
        )}

        {passo < 3 ? (
          <button
            type="button"
            onClick={() => {
              // No modo manual, seguir sem ninguém marcado geraria uma
              // campanha vazia lá no fim — melhor barrar aqui, com contexto.
              if (passo === 1 && selecaoManual && escolhidos.size === 0) {
                setErro("Marque ao menos um lead antes de continuar.");
                return;
              }
              setErro(null);
              setPasso((p) => (p === 1 ? 2 : 3));
            }}
            className="bg-acento hover:bg-acento-hover text-fluid-sm flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-5 font-medium text-white transition-colors"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={disparar}
            disabled={criando}
            className="bg-acento hover:bg-acento-hover text-fluid-sm flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-5 font-medium text-white transition-colors disabled:opacity-60"
          >
            <Rocket className="h-4 w-4" />
            {criando ? "Criando…" : "Começar a enviar"}
          </button>
        )}
      </div>
    </section>
  );
}
