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
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} aria-describedby="meta-ex" />
      </label>
      <label className="block">
        <span className="text-fluid-xs text-tenue mb-1 block">Quanto costuma ganhar por venda (opcional)</span>
        <input inputMode="decimal" value={porVenda} onChange={(e) => setPorVenda(e.target.value)} className={campo} aria-describedby="meta-ex" />
      </label>
      <p id="meta-ex" className="text-fluid-xs text-tenue sm:col-span-2">
        Exemplo: 15.000 de meta e 6.000 por venda. O valor por venda só é usado até você ter duas vendas registradas; depois vale a média das suas vendas.
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
  /*
   * A marca de "onde o ritmo pede que você esteja hoje" (28/09/2026). Não é
   * previsão do mês: comissão chega em degraus (uma venda de uma vez), e
   * projetar o fim do mês pelo que entrou até agora mentiria nos dois
   * sentidos. A marca só diz se hoje você está adiantado ou atrasado.
   */
  const marca =
    r.esperadoHoje !== null && r.meta > 0 && !r.atingida && r.esperadoHoje > 0
      ? Math.min(100, Math.round((r.esperadoHoje / r.meta) * 100))
      : null;
  const adiantado = r.esperadoHoje !== null && r.ganho >= r.esperadoHoje;
  const barra = <MedidorDaMeta progresso={r.progresso} marca={marca} compacto={compacto} />;
  const linhaDoRitmo =
    marca !== null && r.esperadoHoje !== null ? (
      <p className="text-fluid-xs text-apoio">
        <span aria-hidden className="bg-titulo mr-1.5 inline-block h-2.5 w-[3px] rounded-full align-middle" />
        {adiantado
          ? `Adiantado: num ritmo constante você teria ${formatarReais(r.esperadoHoje)} hoje.`
          : `Atrasado: num ritmo constante você já teria ${formatarReais(r.esperadoHoje)} hoje.`}
      </p>
    ) : null;

  if (compacto) {
    return (
      <Link href="/corretor/financeiro/extrato" className="cartao hover:border-acento-linha flex items-center gap-4 p-4 transition-colors">
        {barra}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-fluid-xs text-tenue">
            Meta do mês · {formatarReais(r.ganho)} de {formatarReais(r.meta)}
          </p>
          <p className="text-fluid-sm text-titulo font-medium">{fraseDoRitmo(r)}</p>
          {linhaDoRitmo}
        </div>
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
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
        {barra}
        <div className="w-full min-w-0 flex-1 space-y-2">
          <p className="text-fluid-lg text-titulo font-bold">{fraseDoRitmo(r)}</p>
          {linhaDoRitmo}
        </div>
      </div>

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
              {r.diasRestantes < 7
                ? `Ritmo: cerca de ${r.atendimentos} atendimentos nos ${r.diasRestantes} dias que faltam.`
                : `Ritmo: cerca de ${r.atendimentosPorSemana} atendimentos por semana até o fim do mês.`}
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

/**
 * Medidor em arco (28/09/2026). A meta é UMA razão contra um limite, e o arco
 * a mostra como velocímetro: quanto já foi, e o traço escuro onde um ritmo
 * constante pediria que você estivesse hoje. O número no meio é o dado; o
 * arco é o reforço. `pathLength=100` deixa o traço em porcentagem direta.
 */
function MedidorDaMeta({ progresso, marca, compacto }: { progresso: number; marca: number | null; compacto: boolean }) {
  const feito = Math.round(Math.min(1, Math.max(0, progresso)) * 100);
  const arco = "M 16 96 A 84 84 0 0 1 184 96";
  let tique: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (marca !== null) {
    const t = Math.PI * (1 - marca / 100);
    const ponto = (raio: number) => ({ x: 100 + raio * Math.cos(t), y: 96 - raio * Math.sin(t) });
    const a = ponto(70);
    const b = ponto(98);
    tique = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  return (
    <svg
      viewBox="0 0 200 108"
      className={`shrink-0 ${compacto ? "w-28" : "w-44 sm:w-52"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={feito}
      aria-label={`Meta do mês: ${feito}% feito`}
    >
      <path d={arco} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-vidro-forte" />
      {feito > 0 && (
        <path
          d={arco}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${feito} 100`}
          className="stroke-acento"
        />
      )}
      {tique && (
        <line {...tique} strokeWidth="3.5" strokeLinecap="round" className="stroke-titulo">
          <title>Onde um ritmo constante pediria que você estivesse hoje</title>
        </line>
      )}
      <text x="100" y="84" textAnchor="middle" className="fill-titulo" style={{ fontSize: 34, fontWeight: 700 }}>
        {feito}%
      </text>
      <text x="100" y="104" textAnchor="middle" className="fill-apoio" style={{ fontSize: 12 }}>
        da meta
      </text>
    </svg>
  );
}
