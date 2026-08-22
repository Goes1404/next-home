"use client";

import { useState, useTransition } from "react";
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
    dormitoriosMin: number | null;
    regiaoInteresse: string | null;
    empreendimentoId: string | null;
  };
  empreendimentos: Opcao[];
}) {
  const [min, setMin] = useState(inicial.orcamentoMin?.toString() ?? "");
  const [max, setMax] = useState(inicial.orcamentoMax?.toString() ?? "");
  const [dorms, setDorms] = useState(inicial.dormitoriosMin?.toString() ?? "");
  const [regiao, setRegiao] = useState(inicial.regiaoInteresse ?? "");
  const [empreendimento, setEmpreendimento] = useState(inicial.empreendimentoId ?? "");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  function salvar() {
    setAviso(null);
    iniciar(async () => {
      const r = await salvarQualificacao(leadId, {
        orcamentoMin: paraNumero(min),
        orcamentoMax: paraNumero(max),
        dormitoriosMin: paraNumero(dorms),
        regiaoInteresse: regiao,
        empreendimentoId: empreendimento || null,
      });
      setAviso(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: r.ok ?? "Salvo." });
    });
  }

  const campo =
    "text-fluid-sm w-full rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo disabled:opacity-50";
  const rotulo = "text-fluid-xs mb-1 block text-tenue";

  return (
    <section className="rounded-2xl border border-linha bg-elevado p-4 sm:p-5">
      <h2 className="text-fluid-base font-medium text-titulo">O que procura</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="text-fluid-sm rounded-full bg-brand-500 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-400 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {aviso && (
          <span
            role="status"
            className={`text-fluid-xs ${aviso.tipo === "erro" ? "text-etapa-areia" : "text-ok"}`}
          >
            {aviso.texto}
          </span>
        )}
      </div>
    </section>
  );
}
