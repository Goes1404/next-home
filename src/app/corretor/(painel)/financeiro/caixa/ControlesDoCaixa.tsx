"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "../../_componentes/Avisos";
import {
  CATEGORIAS_DO_TIPO,
  MESES_MAXIMOS_DA_SERIE,
  ROTULO_CATEGORIA,
  problemasDoLancamento,
  type TipoMovimento,
} from "@/lib/financeiro/caixa";
import { lerReais } from "@/lib/financeiro/venda";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { criarLancamento, informarSaldo, preverComissao, type ResultadoCaixa } from "./acoes";

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full min-w-0 rounded-lg border px-3 disabled:opacity-50";
const rotulo = "text-fluid-xs mb-1 block text-tenue";

const falhaDeRede = (e: unknown) =>
  ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não deu para completar. Confira a conexão e tente de novo.";

function useAcao() {
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const router = useRouter();
  const rodar = (acao: () => Promise<ResultadoCaixa>, depois?: () => void) =>
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        if (r.ok) avisar(r.ok);
        depois?.();
        router.refresh();
      } catch (e) {
        falhar(falhaDeRede(e));
      }
    });
  return { pendente, rodar };
}

/** O formulário de conta a pagar ou a receber. Fechado até alguém abrir. */
export function NovoLancamento({ hoje }: { hoje: string }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoMovimento>("saida");
  const [categoria, setCategoria] = useState<string>("aluguel");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hoje);
  const [jaPago, setJaPago] = useState(false);
  const [repetir, setRepetir] = useState("1");
  const { pendente, rodar } = useAcao();
  const { falhar } = useAvisos();

  function trocarTipo(t: TipoMovimento) {
    setTipo(t);
    setCategoria(CATEGORIAS_DO_TIPO[t][0]);
  }

  function salvar() {
    const digitado = {
      tipo,
      categoria,
      descricao,
      valor: lerReais(valor),
      vencimento,
      jaPago,
      repetirMeses: Number(repetir),
    };
    const problemas = problemasDoLancamento(digitado);
    if (problemas.length) {
      falhar(problemas[0]);
      return;
    }
    rodar(
      () => criarLancamento(digitado),
      () => {
        setDescricao("");
        setValor("");
        setJaPago(false);
        setRepetir("1");
        setAberto(false);
      },
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-fluid-sm bg-acento text-sobre-cor hover:bg-acento-hover inline-flex min-h-11 items-center rounded-xl px-4 font-medium"
      >
        + Nova conta a pagar ou receber
      </button>
    );
  }

  return (
    <section className="cartao space-y-3 p-4 sm:p-5">
      <h2 className="text-fluid-base text-titulo font-medium">Nova conta</h2>
      <div role="group" aria-label="Tipo" className="border-linha-forte inline-flex overflow-hidden rounded-lg border">
        {(["saida", "entrada"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => trocarTipo(t)}
            className={`text-fluid-sm min-h-11 px-4 font-medium transition-colors ${
              tipo === t ? "bg-acento text-sobre-cor" : "text-corpo hover:bg-vidro"
            }`}
          >
            {t === "saida" ? "A pagar" : "A receber"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={rotulo} htmlFor="caixa-descricao">
            Descrição
          </label>
          <input
            id="caixa-descricao"
            value={descricao}
            maxLength={200}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={tipo === "saida" ? "Aluguel do escritório" : "Comissão de revenda"}
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="caixa-categoria">
            Categoria
          </label>
          <select id="caixa-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${campo} select-seta`}>
            {CATEGORIAS_DO_TIPO[tipo].map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="caixa-valor">
            Valor (R$)
          </label>
          <input
            id="caixa-valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="caixa-vencimento">
            Vencimento
          </label>
          <input id="caixa-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="caixa-repetir">
            Repetir todo mês
          </label>
          <select id="caixa-repetir" value={repetir} onChange={(e) => setRepetir(e.target.value)} className={`${campo} select-seta`}>
            <option value="1">Não repetir</option>
            {[3, 6, 12, MESES_MAXIMOS_DA_SERIE].map((n) => (
              <option key={n} value={n}>
                Por {n} meses
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="text-fluid-sm text-corpo flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} className="accent-acento h-4.5 w-4.5" />
        {tipo === "saida" ? "Já foi pago" : "Já foi recebido"}
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="text-fluid-sm bg-acento text-sobre-cor hover:bg-acento-hover inline-flex min-h-11 items-center rounded-xl px-4 font-medium disabled:opacity-60"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-fluid-sm border-linha text-corpo hover:border-acento-linha inline-flex min-h-11 items-center rounded-xl border px-4"
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

/** Informar o saldo da conta hoje. */
export function FormularioSaldo({ temSaldo }: { temSaldo: boolean }) {
  const [aberto, setAberto] = useState(!temSaldo);
  const [valor, setValor] = useState("");
  const { pendente, rodar } = useAcao();
  const { falhar } = useAvisos();

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-fluid-xs text-apoio hover:text-titulo min-h-11 underline">
        Atualizar saldo
      </button>
    );
  }

  function salvar() {
    const negativo = valor.trim().startsWith("-");
    const n = lerReais(valor.replace("-", ""));
    if (n === null) {
      falhar("Informe o saldo em reais.");
      return;
    }
    rodar(() => informarSaldo(negativo ? -n : n), () => {
      setValor("");
      setAberto(false);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <label className={rotulo} htmlFor="caixa-saldo">
          Saldo da conta hoje (R$)
        </label>
        <input id="caixa-saldo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} />
      </div>
      <button
        type="button"
        onClick={salvar}
        disabled={pendente}
        className="text-fluid-sm bg-acento text-sobre-cor hover:bg-acento-hover inline-flex min-h-11 items-center rounded-xl px-4 font-medium disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Salvar saldo"}
      </button>
    </div>
  );
}

/** A data em que a construtora deve pagar a comissão. */
export function PrevisaoDaComissao({ vendaId, atual }: { vendaId: string; atual: string | null }) {
  const [data, setData] = useState(atual ?? "");
  const { pendente, rodar } = useAcao();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`prev-${vendaId}`}>
        Previsão de pagamento da comissão
      </label>
      <input
        id={`prev-${vendaId}`}
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        className={`${campo} w-auto`}
      />
      <button
        type="button"
        disabled={pendente || !data || data === atual}
        onClick={() => rodar(() => preverComissao(vendaId, data))}
        className="text-fluid-sm border-linha text-corpo hover:border-acento-linha inline-flex min-h-11 items-center rounded-xl border px-3 disabled:opacity-50"
      >
        {pendente ? "Salvando…" : "Salvar data"}
      </button>
    </div>
  );
}
