"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { formatarReais, lerReais } from "@/lib/financeiro/venda";
import {
  fraseDoRitmo,
  ROTULO_FONTE_COMISSAO,
  ROTULO_FONTE_TAXA,
  type Ritmo,
} from "@/lib/financeiro/ritmo";
import { salvarMeta } from "./acoes";

/**
 * A meta do mês traduzida em trabalho (F5). Mesmo componente no Extrato
 * (completo) e no Início (`compacto`, só a frase e a barra, com link).
 *
 * A régua: o que aparece é trabalho ("faltam 2 vendas, que pedem 10
 * visitas"), não só dinheiro. E cada taxa diz de onde veio — "pelo seu
 * histórico" ou "pela média da equipe" —, porque um número sem origem é um
 * número em que ninguém confia.
 */

export type EstadoDaMeta =
  | { estado: "sem_meta"; estimativaAnterior: number | null }
  | { estado: "ok"; ritmo: Ritmo; metaComissao: number; comissaoPorVendaDigitada: number | null };

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full min-w-0 rounded-lg border px-3";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function FormularioDaMeta({
  meta,
  estimativa,
  aoTerminar,
}: {
  meta: number | null;
  estimativa: number | null;
  aoTerminar?: () => void;
}) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [salvando, iniciar] = useTransition();
  const [valor, setValor] = useState(meta ? String(meta) : "");
  const [porVenda, setPorVenda] = useState(estimativa ? String(estimativa) : "");

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          try {
            const r = await salvarMeta({ metaComissao: lerReais(valor), comissaoPorVenda: porVenda ? lerReais(porVenda) : null });
            if (r.erro) return falhar(r.erro);
            avisar(r.ok ?? "Meta salva.");
            aoTerminar?.();
            router.refresh();
          } catch {
            falhar("Não deu para salvar. Confira a conexão e tente de novo.");
          }
        });
      }}
    >
      <label className="block">
        <span className="text-fluid-xs text-tenue mb-1 block">Quanto quer ganhar este mês (R$)</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="15.000" className={campo} />
      </label>
      <label className="block">
        <span className="text-fluid-xs text-tenue mb-1 block">Quanto costuma ganhar por venda (opcional)</span>
        <input inputMode="decimal" value={porVenda} onChange={(e) => setPorVenda(e.target.value)} placeholder="6.000" className={campo} />
      </label>
      <p className="text-fluid-xs text-tenue sm:col-span-2">
        O valor por venda só é usado até você ter duas vendas registradas; depois vale a média das suas vendas.
      </p>
      <button
        type="submit"
        disabled={salvando}
        className="text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-5 font-bold disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
      >
        {salvando ? "Salvando…" : "Salvar meta"}
      </button>
    </form>
  );
}

export function CartaoMeta({ estado, compacto = false }: { estado: EstadoDaMeta; compacto?: boolean }) {
  const [editando, setEditando] = useState(false);

  if (estado.estado === "sem_meta") {
    if (compacto) {
      return (
        <Link href="/corretor/financeiro/extrato" className="cartao hover:border-acento-linha block p-4 transition-colors">
          <p className="text-fluid-sm text-titulo font-medium">Qual é a sua meta deste mês?</p>
          <p className="text-fluid-xs text-apoio mt-1">Diga quanto quer ganhar e eu mostro quantas vendas e visitas faltam →</p>
        </Link>
      );
    }
    return (
      <section className="cartao space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="text-fluid-base text-titulo font-medium">Sua meta do mês</h2>
          <p className="text-fluid-sm text-apoio mt-1">
            Diga quanto quer ganhar em comissão. Eu traduzo em vendas, visitas e atendimentos pela sua conversão.
          </p>
        </div>
        <FormularioDaMeta meta={null} estimativa={estado.estimativaAnterior} />
      </section>
    );
  }

  const r = estado.ritmo;
  const barra = (
    <div className="bg-vidro-forte h-2.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progresso * 100)}>
      <div className="bg-acento h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(r.progresso * 100)}%` }} />
    </div>
  );

  if (compacto) {
    return (
      <Link href="/corretor/financeiro/extrato" className="cartao hover:border-acento-linha block space-y-2 p-4 transition-colors">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-fluid-xs text-tenue">Meta do mês</p>
          <p className="text-fluid-xs text-apoio">
            {formatarReais(r.ganho)} de {formatarReais(r.meta)}
          </p>
        </div>
        {barra}
        <p className="text-fluid-sm text-titulo font-medium">{fraseDoRitmo(r)}</p>
      </Link>
    );
  }

  return (
    <section className="cartao space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-fluid-base text-titulo font-medium">Sua meta do mês</h2>
          <p className="text-fluid-sm text-apoio mt-1">
            {formatarReais(r.ganho)} de {formatarReais(r.meta)} · faltam {r.diasRestantes}{" "}
            {r.diasRestantes === 1 ? "dia" : "dias"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="text-fluid-xs text-apoio hover:text-titulo border-linha-forte min-h-11 rounded-lg border px-3"
        >
          {editando ? "Fechar" : "Ajustar meta"}
        </button>
      </div>
      {barra}
      <p className="text-fluid-lg text-titulo font-bold">{fraseDoRitmo(r)}</p>

      {!r.atingida && r.vendas !== null && (
        <ul className="text-fluid-xs text-apoio space-y-1">
          {r.comissaoPorVenda && (
            <li>
              Cada venda rende cerca de {formatarReais(r.comissaoPorVenda.valor)} para você (
              {ROTULO_FONTE_COMISSAO[r.comissaoPorVenda.fonte]}).
            </li>
          )}
          {r.visitaParaVenda ? (
            <li>
              {pct(r.visitaParaVenda.valor)} das visitas viram venda, {ROTULO_FONTE_TAXA[r.visitaParaVenda.fonte]}.
            </li>
          ) : (
            <li>Ainda não há visitas suficientes, suas ou da equipe, para dizer quantas viram venda.</li>
          )}
          {r.leadParaVisita && (
            <li>
              {pct(r.leadParaVisita.valor)} dos atendimentos viram visita, {ROTULO_FONTE_TAXA[r.leadParaVisita.fonte]}.
            </li>
          )}
          {r.atendimentosPorSemana !== null && (
            <li className="text-titulo font-medium">
              Ritmo: cerca de {r.atendimentosPorSemana} atendimentos por semana até o fim do mês.
            </li>
          )}
        </ul>
      )}

      {editando && (
        <FormularioDaMeta
          meta={estado.metaComissao}
          estimativa={estado.comissaoPorVendaDigitada}
          aoTerminar={() => setEditando(false)}
        />
      )}
    </section>
  );
}
