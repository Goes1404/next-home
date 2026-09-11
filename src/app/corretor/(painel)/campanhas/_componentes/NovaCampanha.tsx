"use client";

import type { FiltroLeadsCampanha } from "@/lib/crm/publicoDaCampanha";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCheck,
  Rocket,
  Search,
  Shield,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import {
  ETAPAS_FUNIL,
  ETAPA_LABEL,
  type Empreendimento,
  type EtapaFunil,
} from "@/lib/types";
import {
  criarCampanha,
  gerarPreviewCampanha,
  listarLeadsElegiveis,
  preverPublicoCampanha,
  type CampanhaListada,
  type LeadElegivel,
  type PreviaPublicoCampanha,
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
    descricao:
      "Leads sem conversa há mais de 15 dias. É a base que mais responde a reativação.",
  },
  {
    valor: "novos_sem_contato",
    titulo: "Quem acabou de chegar",
    descricao:
      "Leads na etapa “Novo lead”, que ainda não receberam seu primeiro contato.",
  },
  {
    valor: "sem_resposta",
    titulo: "Abordado e sem resposta",
    descricao:
      "Quem já recebeu mensagem nossa e não respondeu — até 2 tentativas. Quem passou disso fica de fora: a terceira não converte e cansa o número.",
  },
  {
    valor: "todos",
    titulo: "Todos os meus leads",
    descricao:
      "A carteira inteira. Use com cuidado: mensagem repetida cansa quem já respondeu.",
  },
  {
    valor: "selecionados",
    titulo: "Escolher um por um",
    descricao: "Você marca exatamente quem recebe — busque pelo nome e monte a lista.",
  },
];

/** Minúsculas e sem acento, para a busca achar "João" digitando "joao". */
function chaveBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function horarioDeBrasiliaParaIso(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}:00-03:00`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function horarioEstaNaJanelaSegura(valor: string): boolean {
  const iso = horarioDeBrasiliaParaIso(valor);
  if (!iso) return false;
  const hora = Number(valor.slice(11, 13));
  const domingo = new Date(iso).getUTCDay() === 0;
  return !domingo && hora >= 9 && hora <= 20;
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
  /*
   * Segunda versão do teste A/B (0084). Vazia = campanha de uma versão só,
   * que é como tudo funcionava antes. Existe porque 102 disparos entregues
   * produziram UMA resposta, e quem decide isso é a abertura.
   */
  const [mensagemB, setMensagemB] = useState("");
  const [testandoDuas, setTestandoDuas] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [modoEnvio, setModoEnvio] = useState<"automatico" | "agendado">("automatico");
  const [agendarPara, setAgendarPara] = useState("");
  const [exemplos, setExemplos] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);
  const [criando, iniciarCriacao] = useTransition();
  const { falhar } = useAvisos();

  // ---- Seleção manual ("Escolher um por um") -------------------------
  // A carteira elegível chega UMA vez, quando a opção é escolhida (~100
  // leads por corretor — diretriz de produto — cabem inteiros na memória;
  // paginar aqui só atrapalharia a busca).
  const [carteira, setCarteira] = useState<LeadElegivel[] | null>(null);
  const [buscaLead, setBuscaLead] = useState("");
  const [etapaLead, setEtapaLead] = useState<EtapaFunil | "todas">("todas");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [previaPublico, setPreviaPublico] = useState<
    (PreviaPublicoCampanha & { filtro: FiltroLeadsCampanha; erro?: boolean }) | null
  >(null);

  useEffect(() => {
    let vivo = true;
    preverPublicoCampanha(publico)
      .then((previa) => {
        if (vivo) setPreviaPublico({ ...previa, filtro: publico });
      })
      .catch(() => {
        if (vivo) {
          setPreviaPublico({ total: 0, protegidos: 0, filtro: publico, erro: true });
        }
      });
    return () => {
      vivo = false;
    };
  }, [publico]);

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
    return carteira.filter((lead) => {
      if (etapaLead !== "todas" && lead.etapa !== etapaLead) return false;
      if (!termo) return true;
      return chaveBusca(`${lead.nome} ${lead.telefone}`).includes(termo);
    });
  }, [carteira, buscaLead, etapaLead]);

  const escolhidosDetalhados = useMemo(
    () => carteira?.filter((lead) => escolhidos.has(lead.id)) ?? [],
    [carteira, escolhidos],
  );
  const todosVisiveisEscolhidos =
    carteiraFiltrada.length > 0 &&
    carteiraFiltrada.every((lead) => escolhidos.has(lead.id));

  function alternarLead(id: string) {
    setEscolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarVisiveis() {
    setEscolhidos((atual) => {
      const proximo = new Set(atual);
      if (todosVisiveisEscolhidos) {
        carteiraFiltrada.forEach((lead) => proximo.delete(lead.id));
      } else {
        carteiraFiltrada.forEach((lead) => proximo.add(lead.id));
      }
      return proximo;
    });
  }

  const imovel = empreendimentos.find((e) => e.slug === imovelSlug) ?? null;
  const nomeImovel = imovel?.nome ?? "nossos lançamentos em Alphaville";
  const publicoEscolhido = PUBLICOS.find((p) => p.valor === publico)!;
  const selecaoManual = publico === "selecionados";
  const leadIds = selecaoManual ? [...escolhidos] : undefined;
  const previaAtual = previaPublico?.filtro === publico ? previaPublico : null;
  const carregandoPublico = previaAtual === null;
  const totalPrevisto = selecaoManual
    ? escolhidos.size
    : previaAtual?.erro
      ? undefined
      : previaAtual?.total;
  /** No modo manual, o rótulo carrega o número — é o que o corretor confere. */
  const rotuloPublico = selecaoManual
    ? `${escolhidos.size} lead${escolhidos.size === 1 ? "" : "s"} escolhido${escolhidos.size === 1 ? "" : "s"} a dedo`
    : publicoEscolhido.titulo;

  function verExemplos() {
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
        falhar(resultado.erro);
        setExemplos([]);
        return;
      }
      setExemplos(resultado.mensagens);
    });
  }

  function disparar() {
    const iniciarEm =
      modoEnvio === "agendado" ? horarioDeBrasiliaParaIso(agendarPara) : null;
    if (modoEnvio === "agendado" && !iniciarEm) {
      falhar("Escolha a data e a hora em que o envio deve começar.");
      return;
    }
    if (modoEnvio === "agendado" && !horarioEstaNaJanelaSegura(agendarPara)) {
      falhar("Escolha um horário entre 9h e 20h59, de segunda a sábado.");
      return;
    }
    // Sem título digitado, o nome do imóvel e a data já descrevem a campanha
    // melhor do que um campo vazio bloqueando o envio.
    const nomeCampanha =
      titulo.trim() ||
      `${rotuloPublico} · ${nomeImovel} · ${new Date().toLocaleDateString("pt-BR")}`;
    iniciarCriacao(async () => {
      const resultado = await criarCampanha({
        titulo: nomeCampanha,
        empreendimentoId: imovel?.id ?? null,
        empreendimentoNome: nomeImovel,
        filtro: publico,
        mensagemBase,
        mensagemBaseB: testandoDuas ? mensagemB : null,
        leadIds,
        iniciarEm,
      });

      if ("erro" in resultado) {
        falhar(resultado.erro);
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
          // Campanha recém-criada não tem envio nenhum, então não há placar.
          testeAB: null,
          criadoEm: new Date().toISOString(),
        },
        modoEnvio === "agendado"
          ? `Lista agendada para ${new Date(iniciarEm!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}, com ${resultado.totalLeads} pessoa${resultado.totalLeads === 1 ? "" : "s"}.`
          : `Lista de transmissão criada para ${resultado.totalLeads} pessoa${resultado.totalLeads === 1 ? "" : "s"}. As mensagens começam a sair sozinhas no próximo horário seguro.`,
      );

      // Volta ao começo para a próxima campanha.
      setPasso(1);
      setTitulo("");
      setExemplos([]);
      setEscolhidos(new Set());
      setBuscaLead("");
      setEtapaLead("todas");
      setModoEnvio("automatico");
      setAgendarPara("");
    });
  }

  return (
    <section className="cartao p-5 sm:p-6">
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
              <p className="text-fluid-xs text-apoio mt-1 leading-snug">
                {opcao.descricao}
              </p>
            </button>
          ))}

          <div className="border-linha bg-elevado flex items-start gap-3 rounded-2xl border p-4 shadow-sm">
            <span className="bg-acento-lavado text-acento-suave flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <UsersRound aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p aria-live="polite" className="text-fluid-sm text-titulo font-semibold">
                {carregandoPublico
                  ? "Conferindo o público…"
                  : totalPrevisto === undefined
                    ? "Não foi possível contar agora"
                    : `${totalPrevisto} pessoa${totalPrevisto === 1 ? "" : "s"} receberá${totalPrevisto === 1 ? "" : "ão"}`}
              </p>
              <p className="text-fluid-xs text-apoio mt-0.5 leading-relaxed">
                {previaAtual && previaAtual.protegidos > 0
                  ? `${previaAtual.protegidos} contato${previaAtual.protegidos === 1 ? "" : "s"} protegido${previaAtual.protegidos === 1 ? "" : "s"}: ${previaAtual.protegidos === 1 ? "já recebeu campanha nos últimos 7 dias ou está em outra lista" : "já receberam campanha nos últimos 7 dias ou estão em outra lista"}.`
                  : "A contagem será conferida novamente no servidor antes de criar a lista."}
              </p>
            </div>
          </div>

          {selecaoManual && (
            <div className="border-acento-linha bg-acento-lavado rounded-2xl border p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Buscar lead por nome ou telefone</span>
                  <Search
                    aria-hidden
                    className="text-tenue pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
                  />
                  <input
                    type="search"
                    value={buscaLead}
                    onChange={(e) => setBuscaLead(e.target.value)}
                    placeholder="Nome ou telefone"
                    className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border pr-10 pl-10 focus:outline-none"
                  />
                  {buscaLead && (
                    <button
                      type="button"
                      onClick={() => setBuscaLead("")}
                      aria-label="Limpar busca"
                      className="text-tenue hover:text-titulo absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </label>

                <label>
                  <span className="sr-only">Filtrar por etapa do funil</span>
                  <select
                    value={etapaLead}
                    onChange={(e) =>
                      setEtapaLead(e.target.value as EtapaFunil | "todas")
                    }
                    className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none sm:w-44"
                  >
                    <option value="todas">Todas as etapas</option>
                    {ETAPAS_FUNIL.filter((etapa) =>
                      carteira?.some((lead) => lead.etapa === etapa),
                    ).map((etapa) => (
                      <option key={etapa} value={etapa}>
                        {ETAPA_LABEL[etapa]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="border-linha mt-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <p aria-live="polite" className="text-fluid-xs text-apoio tabular-nums">
                  {carteiraFiltrada.length} resultado
                  {carteiraFiltrada.length === 1 ? "" : "s"} · {escolhidos.size}{" "}
                  selecionado
                  {escolhidos.size === 1 ? "" : "s"}
                </p>
                {carteiraFiltrada.length > 0 && (
                  <button
                    type="button"
                    onClick={alternarVisiveis}
                    className="text-fluid-xs text-acento-suave hover:text-titulo flex min-h-11 items-center gap-1.5 font-semibold transition-colors"
                  >
                    <CheckCheck aria-hidden className="h-4 w-4" />
                    {todosVisiveisEscolhidos
                      ? "Desmarcar resultados"
                      : "Selecionar resultados"}
                  </button>
                )}
              </div>

              {/* Teto de altura + rolagem própria: a carteira pode ter 100
                  nomes e o passo 1 não pode virar uma página infinita. */}
              <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
                {carteira === null && (
                  <p className="text-fluid-xs text-apoio px-1 py-3">
                    Carregando seus leads…
                  </p>
                )}
                {carteira !== null && carteiraFiltrada.length === 0 && (
                  <p className="text-fluid-xs text-apoio px-1 py-3">
                    {carteira.length === 0
                      ? "Nenhum lead com WhatsApp disponível para a lista."
                      : "Ninguém combina com essa busca e etapa."}
                  </p>
                )}
                {carteiraFiltrada.map((lead) => (
                  <label
                    key={lead.id}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                      escolhidos.has(lead.id)
                        ? "border-acento-linha bg-elevado"
                        : "hover:border-linha hover:bg-vidro border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={escolhidos.has(lead.id)}
                      onChange={() => alternarLead(lead.id)}
                      className="accent-acento h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-fluid-sm text-titulo block truncate font-medium">
                        {lead.nome}
                      </span>
                      <span className="text-fluid-xs text-apoio block truncate tabular-nums">
                        {lead.telefone} · {ETAPA_LABEL[lead.etapa]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {escolhidosDetalhados.length > 0 && (
                <div className="border-linha mt-3 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-fluid-xs text-titulo font-semibold">
                      Quem vai receber
                    </p>
                    <button
                      type="button"
                      onClick={() => setEscolhidos(new Set())}
                      className="text-fluid-xs text-apoio hover:text-perigo min-h-9 transition-colors"
                    >
                      Limpar seleção
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {escolhidosDetalhados.slice(0, 6).map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => alternarLead(lead.id)}
                        aria-label={`Remover ${lead.nome} da lista`}
                        className="border-linha bg-elevado text-corpo hover:border-perigo-linha hover:text-perigo flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs transition-colors"
                      >
                        <span className="min-w-0 truncate">{lead.nome}</span>
                        <X aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    ))}
                    {escolhidosDetalhados.length > 6 && (
                      <span className="bg-vidro text-apoio flex min-h-9 items-center rounded-full px-3 text-xs">
                        +{escolhidosDetalhados.length - 6} pessoas
                      </span>
                    )}
                  </div>
                </div>
              )}
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
            Escreva como você falaria. A IA reescreve cada mensagem com palavras um
            pouco diferentes — mensagens idênticas em massa é o que faz o WhatsApp
            bloquear números.
          </p>
          <textarea
            rows={4}
            value={mensagemBase}
            onChange={(e) => setMensagemBase(e.target.value)}
            aria-label="Mensagem da lista de transmissão"
            className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento w-full rounded-xl border p-3.5 focus:outline-none"
          />
          <p className="text-fluid-xs text-tenue">
            <code className="bg-vidro-forte rounded px-1">{"{nome}"}</code> vira o nome
            da pessoa e{" "}
            <code className="bg-vidro-forte rounded px-1">{"{imovel}"}</code> vira{" "}
            {nomeImovel}.
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

          {/*
            Testar duas aberturas. Fica atrás de um clique porque o caminho
            normal é uma mensagem só — e porque a comparação só vale a pena
            com lista grande o bastante para dar 30 envios de cada lado.
          */}
          {!testandoDuas ? (
            <button
              type="button"
              onClick={() => setTestandoDuas(true)}
              className="text-fluid-xs text-apoio hover:text-titulo min-h-11 underline underline-offset-2 transition-colors"
            >
              + Testar duas aberturas e ver qual responde mais
            </button>
          ) : (
            <div className="border-linha space-y-2 rounded-xl border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-fluid-sm text-titulo font-medium">Versão B</p>
                <button
                  type="button"
                  onClick={() => {
                    setTestandoDuas(false);
                    setMensagemB("");
                  }}
                  className="text-fluid-xs text-apoio hover:text-titulo min-h-9 transition-colors"
                >
                  remover
                </button>
              </div>
              <p className="text-fluid-xs text-apoio">
                Metade da lista recebe cada versão, alternadas. Depois de 30 envios de
                cada lado, o histórico mostra qual teve mais resposta.
              </p>
              <textarea
                rows={4}
                value={mensagemB}
                onChange={(e) => setMensagemB(e.target.value)}
                placeholder="Escreva a segunda abertura — mude uma coisa só, senão não dá para saber o que funcionou."
                aria-label="Segunda versão da mensagem"
                className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento placeholder:text-tenue w-full rounded-xl border p-3.5 focus:outline-none"
              />
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

          <fieldset className="border-linha rounded-2xl border p-4">
            <legend className="text-fluid-xs text-apoio px-1">Quando começar?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  modoEnvio === "automatico"
                    ? "border-acento-linha bg-acento-lavado"
                    : "border-linha hover:border-linha-forte"
                }`}
              >
                <input
                  type="radio"
                  name="quando-enviar"
                  checked={modoEnvio === "automatico"}
                  onChange={() => setModoEnvio("automatico")}
                  className="accent-acento mt-1 h-4 w-4"
                />
                <span>
                  <span className="text-fluid-sm text-titulo block font-medium">
                    Próximo horário seguro
                  </span>
                  <span className="text-fluid-xs text-apoio mt-0.5 block">
                    A plataforma escolhe e respeita a fila.
                  </span>
                </span>
              </label>
              <label
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  modoEnvio === "agendado"
                    ? "border-acento-linha bg-acento-lavado"
                    : "border-linha hover:border-linha-forte"
                }`}
              >
                <input
                  type="radio"
                  name="quando-enviar"
                  checked={modoEnvio === "agendado"}
                  onChange={() => setModoEnvio("agendado")}
                  className="accent-acento mt-1 h-4 w-4"
                />
                <span>
                  <span className="text-fluid-sm text-titulo flex items-center gap-1.5 font-medium">
                    <CalendarClock aria-hidden className="h-4 w-4" /> Agendar
                  </span>
                  <span className="text-fluid-xs text-apoio mt-0.5 block">
                    Escolha dia e hora de Brasília.
                  </span>
                </span>
              </label>
            </div>

            {modoEnvio === "agendado" && (
              <div className="mt-3">
                <label
                  className="text-fluid-xs text-apoio block"
                  htmlFor="inicio-campanha"
                >
                  Início do envio
                </label>
                <input
                  id="inicio-campanha"
                  type="datetime-local"
                  step="300"
                  value={agendarPara}
                  onChange={(e) => setAgendarPara(e.target.value)}
                  aria-describedby="janela-segura-campanha"
                  className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento mt-1 min-h-12 w-full rounded-xl border px-3.5 focus:outline-none"
                />
                <p
                  id="janela-segura-campanha"
                  className="text-fluid-xs text-apoio mt-1.5"
                >
                  Segunda a sábado, entre 9h e 20h59. A pausa de 35–75 segundos continua
                  valendo.
                </p>
              </div>
            )}
          </fieldset>

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
            As mensagens saem uma a uma, com pausa entre elas e só em horário comercial
            — é o que mantém seu número seguro.
          </p>
        </div>
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
                falhar("Marque ao menos um lead antes de continuar.");
                return;
              }
              if (passo === 1 && !selecaoManual && previaAtual?.total === 0) {
                falhar("Não há pessoas disponíveis nesse público agora.");
                return;
              }
              setPasso((p) => (p === 1 ? 2 : 3));
            }}
            className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-5 font-medium transition-colors"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={disparar}
            disabled={criando}
            className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-5 font-medium transition-colors disabled:opacity-60"
          >
            <Rocket className="h-4 w-4" />
            {criando ? "Criando…" : "Começar a enviar"}
          </button>
        )}
      </div>
    </section>
  );
}
