"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Rocket, Shield, Sparkles } from "lucide-react";
import type { Empreendimento } from "@/lib/types";
import {
  criarCampanha,
  gerarPreviewCampanha,
  type CampanhaListada,
  type FiltroLeadsCampanha,
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
];

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

  const imovel = empreendimentos.find((e) => e.slug === imovelSlug) ?? null;
  const nomeImovel = imovel?.nome ?? "nossos lançamentos em Alphaville";
  const publicoEscolhido = PUBLICOS.find((p) => p.valor === publico)!;

  function verExemplos() {
    setErro(null);
    setGerando(true);
    iniciarCriacao(async () => {
      const resultado = await gerarPreviewCampanha({
        filtro: publico,
        empreendimentoNome: nomeImovel,
        mensagemBase,
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
      `${publicoEscolhido.titulo} · ${nomeImovel} · ${new Date().toLocaleDateString("pt-BR")}`;

    setErro(null);
    iniciarCriacao(async () => {
      const resultado = await criarCampanha({
        titulo: nomeCampanha,
        empreendimentoId: imovel?.id ?? null,
        empreendimentoNome: nomeImovel,
        filtro: publico,
        mensagemBase,
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
        `Campanha criada para ${resultado.totalLeads} pessoa${resultado.totalLeads === 1 ? "" : "s"}. As mensagens já começaram a sair sozinhas — não precisa clicar em mais nada.`,
      );

      // Volta ao começo para a próxima campanha.
      setPasso(1);
      setTitulo("");
      setExemplos([]);
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
            aria-label="Mensagem da campanha"
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
              <dd className="text-titulo">{publicoEscolhido.titulo}</dd>
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
              Nome desta campanha (opcional — só para você achar depois)
            </label>
            <input
              id="titulo-campanha"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={`${publicoEscolhido.titulo} · ${nomeImovel}`}
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
            onClick={() => setPasso((p) => (p === 1 ? 2 : 3))}
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
