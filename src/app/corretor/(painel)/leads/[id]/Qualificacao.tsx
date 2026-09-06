"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { salvarQualificacao } from "./acoes";

/**
 * O que o cliente procura: orçamento, região, dormitórios e imóvel de
 * interesse.
 *
 * Em produção, 0 de 20 leads tinham `empreendimento_id` e não havia onde
 * anotar faixa de preço — o CRM guardava o contato e esquecia a intenção.
 * Enquanto a IA não conversa com o lead, isto é preenchido à mão pelo
 * corretor; quando houver dossiê, ele passa a sugerir os valores aqui.
 */

type Opcao = { id: string; nome: string };

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function paraNumero(valor: string): number | null {
  const limpo = valor.replace(/\D/g, "");
  return limpo ? Number(limpo) : null;
}

export function Qualificacao({
  leadId,
  inicial,
  empreendimentos,
}: {
  leadId: string;
  inicial: {
    orcamentoMin: number | null;
    orcamentoMax: number | null;
    rendaMensal: number | null;
    dormitoriosMin: number | null;
    regiaoInteresse: string | null;
    empreendimentoId: string | null;
  };
  empreendimentos: Opcao[];
}) {
  const [min, setMin] = useState(inicial.orcamentoMin?.toString() ?? "");
  const [max, setMax] = useState(inicial.orcamentoMax?.toString() ?? "");
  const [renda, setRenda] = useState(inicial.rendaMensal?.toString() ?? "");
  const [dorms, setDorms] = useState(inicial.dormitoriosMin?.toString() ?? "");
  const [regiao, setRegiao] = useState(inicial.regiaoInteresse ?? "");
  const [empreendimento, setEmpreendimento] = useState(inicial.empreendimentoId ?? "");
  const [salvando, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  function salvar() {
    iniciar(async () => {
      try {
        const r = await salvarQualificacao(leadId, {
          orcamentoMin: paraNumero(min),
          orcamentoMax: paraNumero(max),
          rendaMensal: paraNumero(renda),
          dormitoriosMin: paraNumero(dorms),
          regiaoInteresse: regiao,
          empreendimentoId: empreendimento || null,
        });
        if (r.erro) falhar(r.erro);
        else avisar(r.ok ?? "Salvo");
      } catch {
        falhar("Não deu para salvar. Confira a conexão e tente de novo.");
      }
    });
  }

  const campo =
    "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full rounded-lg border px-3 disabled:opacity-50";

  /*
   * Nasce FECHADA quando não há nada preenchido.
   *
   * Medido em 02/09/2026: dos 116 leads, ZERO tinham orçamento, renda,
   * dormitórios ou região — em toda a história do banco. A seção abria seis
   * campos em branco, sem uma linha dizendo para que servem, no meio de um
   * cabeçalho que já empilha outras dez faixas. Seis campos vazios que
   * ninguém preenche não são um formulário: são ruído com aparência de
   * trabalho pendente.
   *
   * Fechada ela continua a UM toque, e o resumo diz o que se ganha ao abrir.
   * Quando houver dado, ela abre sozinha — aí o conteúdo justifica o espaço.
   */
  const temAlgo = Boolean(min || max || renda || dorms || regiao || empreendimento);
  const rotulo = "text-fluid-xs mb-1 block text-tenue";

  return (
    <details open={temAlgo} className="border-linha bg-elevado rounded-2xl border p-4 sm:p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
        <h2 className="text-fluid-base text-titulo font-medium">O que procura</h2>
        <span className="text-fluid-xs text-tenue">
          {temAlgo ? "editar" : "preencher"}
        </span>
      </summary>

      {!temAlgo && (
        <p className="text-fluid-sm text-apoio mt-3">
          Anote aqui o que este cliente procura. O que estiver preenchido a
          assistente usa na conversa — e é o que evita oferecer imóvel fora do
          que ele pode.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="renda">
            Renda mensal da família
          </label>
          <input
            id="renda"
            className={campo}
            inputMode="numeric"
            placeholder="ex.: 18000"
            value={renda}
            onChange={(e) => setRenda(e.target.value)}
            disabled={salvando}
          />
          <p className="text-fluid-xs mt-1 text-tenue">
            Diferente do orçamento: é o que entra por mês, e é o que define o financiamento. A IA
            pergunta isso na conversa e preenche sozinha.
          </p>
        </div>

        <div>
          <label className={rotulo} htmlFor="orc-min">
            Orçamento de
          </label>
          <input
            id="orc-min"
            inputMode="numeric"
            value={min}
            disabled={salvando}
            onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))}
            placeholder="600000"
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="orc-max">
            até
          </label>
          <input
            id="orc-max"
            inputMode="numeric"
            value={max}
            disabled={salvando}
            onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
            placeholder="900000"
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="dorms">
            Dormitórios (mínimo)
          </label>
          <input
            id="dorms"
            inputMode="numeric"
            value={dorms}
            disabled={salvando}
            onChange={(e) => setDorms(e.target.value.replace(/\D/g, ""))}
            placeholder="3"
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="regiao">
            Região de interesse
          </label>
          <input
            id="regiao"
            value={regiao}
            disabled={salvando}
            onChange={(e) => setRegiao(e.target.value)}
            placeholder="Alphaville, Tamboré…"
            className={campo}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={rotulo} htmlFor="empreendimento">
            Imóvel de interesse
          </label>
          <select
            id="empreendimento"
            value={empreendimento}
            disabled={salvando}
            onChange={(e) => setEmpreendimento(e.target.value)}
            className={campo}
          >
            <option value="">— nenhum —</option>
            {empreendimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(min || max) && (
        <p className="text-fluid-xs mt-3 text-tenue">
          Faixa: {min ? moeda.format(Number(min)) : "—"} a {max ? moeda.format(Number(max)) : "—"}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Era `bg-brand-500 text-white`: tinta da MARCA chumbada, no lugar da
            cor do módulo — e branco sobre ela some no tema em que o acento é
            claro. */}
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-11 rounded-full px-4 font-medium transition-colors disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </details>
  );
}
