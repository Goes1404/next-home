"use client";

import { useMemo, useState } from "react";
import type { CanalDoGrafico } from "@/lib/crm/impulsionamentosCalculo";
import { ROTULO_CANAL_DO_GRAFICO } from "@/lib/crm/impulsionamentosCalculo";
import {
  canaisDoPeriodo,
  indicadoresEntre,
  janelaDo,
  semanasDa,
  variacao,
  type DadosDoPainel,
  type FatiaDoCanal,
  type Indicadores,
  type Periodo,
  type Semana,
} from "@/lib/crm/painelDosAnuncios";

/**
 * Painel de indicadores dos anúncios pagos (07/10/2026), no estilo Power BI:
 * filtros numa linha em cima (período e canal), e tudo embaixo recalcula. A
 * pizza e a legenda também filtram: tocar num canal recorta o painel inteiro.
 *
 * A cor segue o CANAL (mapa fixo abaixo), nunca a posição, então filtrar não
 * repinta ninguém. A paleta foi validada para daltonismo; três tons ficam
 * abaixo de 3:1 no tema claro, por isso todo gráfico tem o número escrito ao
 * lado ou a tabela embaixo.
 */

const COR: Record<CanalDoGrafico, { bg: string; stroke: string }> = {
  instagram: { bg: "bg-serie-1", stroke: "stroke-serie-1" },
  facebook: { bg: "bg-serie-2", stroke: "stroke-serie-2" },
  google: { bg: "bg-serie-3", stroke: "stroke-serie-3" },
  portal: { bg: "bg-serie-4", stroke: "stroke-serie-4" },
  meta: { bg: "bg-serie-5", stroke: "stroke-serie-5" },
  outro: { bg: "bg-serie-6", stroke: "stroke-serie-6" },
};

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 30, rotulo: "30 dias" },
  { valor: 90, rotulo: "90 dias" },
  { valor: 180, rotulo: "6 meses" },
  { valor: "tudo", rotulo: "Tudo" },
];

const reais = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const diaCurto = (dia: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`));

const CHIP =
  "min-h-10 rounded-full border px-3.5 text-fluid-xs font-semibold transition-colors inline-flex items-center gap-2";
const CHIP_ATIVO = "border-acento bg-acento text-sobre-cor";
const CHIP_INATIVO = "border-linha-forte text-titulo hover:bg-vidro";

export function PainelDeIndicadores({ dados }: { dados: DadosDoPainel }) {
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [canal, setCanal] = useState<CanalDoGrafico | null>(null);

  const janela = useMemo(() => janelaDo(dados, periodo), [dados, periodo]);
  const atual = useMemo(() => indicadoresEntre(dados, janela.de, janela.ate, canal), [dados, janela, canal]);
  const anterior = useMemo(
    () => (janela.anterior ? indicadoresEntre(dados, janela.anterior.de, janela.anterior.ate, canal) : null),
    [dados, janela, canal],
  );
  const semanas = useMemo(() => semanasDa(dados, janela, canal), [dados, janela, canal]);
  const fatias = useMemo(() => canaisDoPeriodo(dados, janela), [dados, janela]);

  if (dados.clientes.length === 0 && dados.linhas.length === 0) return null;
  const alternar = (c: CanalDoGrafico) => setCanal((atualCanal) => (atualCanal === c ? null : c));

  return (
    <section className="cartao space-y-5 p-4 sm:p-5" aria-labelledby="painel-titulo">
      <header className="space-y-3">
        <div>
          <h2 id="painel-titulo" className="text-fluid-base font-medium text-titulo">
            Painel dos anúncios
          </h2>
          <p className="mt-1 text-fluid-xs text-apoio">
            {diaCurto(janela.de)} a {diaCurto(janela.ate)}
            {canal ? ` · só ${ROTULO_CANAL_DO_GRAFICO[canal]}` : " · todos os canais"}
            {janela.anterior ? ` · comparado aos ${janela.dias} dias anteriores` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.rotulo}
              type="button"
              aria-pressed={periodo === p.valor}
              onClick={() => setPeriodo(p.valor)}
              className={`${CHIP} ${periodo === p.valor ? CHIP_ATIVO : CHIP_INATIVO}`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        {fatias.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Canal">
            <button
              type="button"
              aria-pressed={canal === null}
              onClick={() => setCanal(null)}
              className={`${CHIP} ${canal === null ? CHIP_ATIVO : CHIP_INATIVO}`}
            >
              Todos
            </button>
            {fatias.map((f) => (
              <button
                key={f.canal}
                type="button"
                aria-pressed={canal === f.canal}
                onClick={() => alternar(f.canal)}
                className={`${CHIP} ${canal === f.canal ? CHIP_ATIVO : CHIP_INATIVO}`}
              >
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${COR[f.canal].bg}`} />
                {f.rotulo}
              </button>
            ))}
          </div>
        )}
      </header>

      <Cartoes atual={atual} anterior={anterior} semanas={semanas} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Pizza fatias={fatias} canal={canal} alternar={alternar} />
        <ColunasPorSemana semanas={semanas} />
      </div>

      <Funil ind={atual} />
    </section>
  );
}

/* ── Cartões de indicador ─────────────────────────────────────────────── */

type DefCartao = {
  rotulo: string;
  valor: (i: Indicadores) => number | null;
  formato: (v: number | null) => string;
  /** Menor é melhor (custo): a variação para baixo pinta de verde. */
  menorMelhor?: boolean;
  serie: (s: Semana) => number | null;
  rodape?: (i: Indicadores) => string | null;
};

const contagem = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR"));

const CARTOES: DefCartao[] = [
  { rotulo: "Investimento", valor: (i) => i.gasto, formato: reais, serie: (s) => s.gasto },
  {
    rotulo: "Clientes",
    valor: (i) => i.clientes,
    formato: contagem,
    serie: (s) => s.clientes,
    rodape: (i) => (i.clientesSemGasto > 0 ? `${i.clientesSemGasto} de campanha sem valor` : null),
  },
  { rotulo: "Custo por cliente", valor: (i) => i.custoPorCliente, formato: reais, menorMelhor: true, serie: (s) => s.custoPorCliente },
  { rotulo: "Visitas", valor: (i) => i.visitas, formato: contagem, serie: (s) => s.visitas },
  { rotulo: "Custo por visita", valor: (i) => i.custoPorVisita, formato: reais, menorMelhor: true, serie: (s) => (s.visitas > 0 && s.gasto > 0 ? s.gasto / s.visitas : null) },
  { rotulo: "Fechados", valor: (i) => i.fechados, formato: contagem, serie: () => null },
];

function Cartoes({ atual, anterior, semanas }: { atual: Indicadores; anterior: Indicadores | null; semanas: Semana[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {CARTOES.map((c) => {
        const v = c.valor(atual);
        const delta = anterior ? variacao(v, c.valor(anterior)) : null;
        const bom = delta === null || delta === 0 ? null : c.menorMelhor ? delta < 0 : delta > 0;
        const rodape = c.rodape?.(atual);
        return (
          <div key={c.rotulo} className="min-w-0 rounded-2xl border border-linha bg-vidro p-3">
            <dt className="text-fluid-xs text-apoio">{c.rotulo}</dt>
            <dd className="mt-1 space-y-1">
              <span className="block font-display text-2xl leading-none font-bold tracking-[-0.02em] text-titulo tabular-nums">
                {c.formato(v)}
              </span>
              {delta !== null ? (
                <span className={`block text-fluid-xs font-semibold ${bom === null ? "text-apoio" : bom ? "text-ok" : "text-perigo"}`}>
                  <span aria-hidden>{delta > 0 ? "▲" : delta < 0 ? "▼" : "•"}</span> {Math.abs(delta)}%
                  <span className="font-normal text-apoio"> vs anterior</span>
                </span>
              ) : (
                <span className="block text-fluid-xs text-apoio">{anterior ? "sem base anterior" : " "}</span>
              )}
              <Sparkline valores={semanas.map(c.serie)} rotulo={c.rotulo} />
              {rodape && <span className="block text-fluid-xs text-apoio">{rodape}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Sparkline({ valores, rotulo }: { valores: (number | null)[]; rotulo: string }) {
  const pts = valores.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);
  if (pts.length < 2) return <span className="block h-7" aria-hidden />;
  const max = Math.max(...pts.map((p) => p.v), 1);
  const n = valores.length - 1 || 1;
  const caminho = pts.map((p) => `${((p.i / n) * 100).toFixed(1)},${(26 - (p.v / max) * 22).toFixed(1)}`).join(" ");
  const ultimo = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="block h-7 w-full text-acento" role="img" aria-label={`Tendência semanal de ${rotulo}`}>
      <polyline points={caminho} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(ultimo.i / n) * 100} cy={26 - (ultimo.v / max) * 22} r={2.5} fill="currentColor" />
    </svg>
  );
}

/* ── Pizza (rosca) do investimento por canal ─────────────────────────── */

function Pizza({ fatias, canal, alternar }: { fatias: FatiaDoCanal[]; canal: CanalDoGrafico | null; alternar: (c: CanalDoGrafico) => void }) {
  const total = fatias.reduce((s, f) => s + f.gasto, 0);
  const R = 15.9155; // circunferência 100
  const comGasto = fatias.filter((f) => f.gasto > 0);
  const inicios = comGasto.map((_, i) => comGasto.slice(0, i).reduce((s, f) => s + (f.gasto / total) * 100, 0));
  return (
    <figure className="min-w-0 space-y-3 rounded-2xl border border-linha p-3">
      <figcaption className="text-fluid-sm font-semibold text-titulo">Investimento por canal</figcaption>
      {total === 0 ? (
        <p className="text-fluid-xs text-apoio">Nenhum gasto registrado no período.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <svg viewBox="0 0 42 42" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`Investimento total ${reais(total)}`}>
            <circle cx="21" cy="21" r={R} fill="none" className="stroke-vidro-forte" strokeWidth="6" />
            {comGasto.map((f, i) => {
                const parte = (f.gasto / total) * 100;
                const inicio = inicios[i];
                const apagada = canal !== null && canal !== f.canal;
                return (
                  <circle
                    key={f.canal}
                    cx="21"
                    cy="21"
                    r={R}
                    fill="none"
                    strokeWidth="6"
                    className={`${COR[f.canal].stroke} cursor-pointer transition-opacity ${apagada ? "opacity-25" : ""}`}
                    strokeDasharray={`${Math.max(parte - 0.8, 0.4)} ${100 - Math.max(parte - 0.8, 0.4)}`}
                    strokeDashoffset={-inicio}
                    onClick={() => alternar(f.canal)}
                  >
                    <title>{`${f.rotulo}: ${reais(f.gasto)} (${Math.round(parte)}%)`}</title>
                  </circle>
                );
              })}
            <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="fill-titulo text-[5px] font-bold" transform="rotate(90 21 21)">
              {reais(total)}
            </text>
          </svg>
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {fatias.map((f) => (
              <li key={f.canal}>
                <button
                  type="button"
                  onClick={() => alternar(f.canal)}
                  aria-pressed={canal === f.canal}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-fluid-xs hover:bg-vidro ${canal !== null && canal !== f.canal ? "opacity-50" : ""}`}
                >
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR[f.canal].bg}`} />
                  <span className="min-w-0 flex-1 truncate text-titulo">{f.rotulo}</span>
                  <span className="shrink-0 font-semibold text-titulo tabular-nums">
                    {total > 0 ? `${Math.round((f.gasto / total) * 100)}%` : "—"}
                  </span>
                  <span className="shrink-0 text-apoio tabular-nums">{reais(f.gasto)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

/* ── Colunas empilhadas: clientes por semana e canal ─────────────────── */

const ORDEM: CanalDoGrafico[] = ["instagram", "facebook", "google", "portal", "meta", "outro"];

function ColunasPorSemana({ semanas }: { semanas: Semana[] }) {
  const [ativa, setAtiva] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const maior = Math.max(1, ...semanas.map((s) => s.clientes));
  const canais = ORDEM.filter((c) => semanas.some((s) => s.porCanal[c]));
  const mostrarRotulo = (i: number) => semanas.length <= 8 || i % Math.ceil(semanas.length / 8) === semanas.length % Math.ceil(semanas.length / 8) || i === semanas.length - 1;

  return (
    <figure className="min-w-0 space-y-3 rounded-2xl border border-linha p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-fluid-sm font-semibold text-titulo">Clientes por semana</figcaption>
        <button type="button" onClick={() => setTabela((t) => !t)} className="min-h-10 rounded-lg px-2 text-fluid-xs text-acento-forte underline decoration-transparent hover:decoration-current">
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {canais.length > 1 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-fluid-xs text-corpo" aria-label="Legenda">
          {canais.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${COR[c].bg}`} />
              {ROTULO_CANAL_DO_GRAFICO[c]}
            </li>
          ))}
        </ul>
      )}
      {tabela ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-fluid-xs">
            <thead>
              <tr className="text-left text-apoio">
                <th className="py-1 font-medium">Semana até</th>
                <th className="py-1 text-right font-medium">Clientes</th>
                <th className="py-1 text-right font-medium">Gasto</th>
                <th className="py-1 text-right font-medium">Por cliente</th>
              </tr>
            </thead>
            <tbody>
              {[...semanas].reverse().map((s) => (
                <tr key={s.fim} className="border-t border-linha text-titulo tabular-nums">
                  <td className="py-1.5">{diaCurto(s.fim)}</td>
                  <td className="py-1.5 text-right">{s.clientes}</td>
                  <td className="py-1.5 text-right">{reais(s.gasto)}</td>
                  <td className="py-1.5 text-right">{reais(s.custoPorCliente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <ol className="flex h-44 items-end gap-1 sm:gap-2" aria-label="Clientes por semana">
            {semanas.map((s, i) => {
              const altura = s.clientes > 0 ? Math.max(4, (s.clientes / maior) * 100) : 0;
              return (
                <li
                  key={s.fim}
                  className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  onMouseEnter={() => setAtiva(i)}
                  onMouseLeave={() => setAtiva(null)}
                  onFocus={() => setAtiva(i)}
                  onBlur={() => setAtiva(null)}
                  tabIndex={0}
                  aria-label={`Semana até ${diaCurto(s.fim)}: ${s.clientes} clientes`}
                >
                  <span className={`mb-0.5 text-fluid-xs tabular-nums ${s.clientes === maior || i === semanas.length - 1 ? "font-bold text-titulo" : "text-transparent"}`}>
                    {s.clientes > 0 ? s.clientes : ""}
                  </span>
                  <span className={`flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t ${ativa !== null && ativa !== i ? "opacity-60" : ""}`} style={{ height: `${altura}%` }}>
                    {ORDEM.map((c) =>
                      s.porCanal[c] ? (
                        <span
                          key={c}
                          className={`block border-t-2 border-superficie first:border-t-0 ${COR[c].bg}`}
                          style={{ height: `${((s.porCanal[c] ?? 0) / s.clientes) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {ativa !== null && semanas[ativa] && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-linha bg-elevado p-2.5 text-fluid-xs shadow-lg"
              style={{ left: `clamp(0px, calc(${((ativa + 0.5) / semanas.length) * 100}% - 5.5rem), calc(100% - 11rem))` }}
            >
              <p className="font-semibold text-titulo">Semana até {diaCurto(semanas[ativa].fim)}</p>
              <p className="text-titulo tabular-nums">
                {semanas[ativa].clientes} clientes · {reais(semanas[ativa].gasto)}
              </p>
              <ul className="mt-1 space-y-0.5">
                {ORDEM.filter((c) => semanas[ativa].porCanal[c]).map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-corpo">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${COR[c].bg}`} />
                    <span className="flex-1">{ROTULO_CANAL_DO_GRAFICO[c]}</span>
                    <span className="tabular-nums text-titulo">{semanas[ativa].porCanal[c]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className="mt-1 flex gap-1 border-t border-linha pt-1 sm:gap-2" aria-hidden>
            {semanas.map((s, i) => (
              <li key={s.fim} className={`flex-1 text-center text-fluid-xs ${i === semanas.length - 1 ? "font-bold text-titulo" : "text-tenue"}`}>
                {mostrarRotulo(i) ? diaCurto(s.fim) : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </figure>
  );
}

/* ── Funil do clique à venda ─────────────────────────────────────────── */

function Funil({ ind }: { ind: Indicadores }) {
  const degraus = [
    { rotulo: "Chegaram", n: ind.clientes, custo: ind.custoPorCliente },
    { rotulo: "Conversaram", n: ind.conversaram, custo: null },
    { rotulo: "Se qualificaram", n: ind.qualificados, custo: ind.custoPorQualificado },
    { rotulo: "Visitaram", n: ind.visitas, custo: ind.custoPorVisita },
    { rotulo: "Fecharam", n: ind.fechados, custo: null },
  ];
  const topo = Math.max(1, ind.clientes);
  return (
    <figure className="space-y-2 rounded-2xl border border-linha p-3">
      <figcaption className="text-fluid-sm font-semibold text-titulo">Do anúncio à venda</figcaption>
      <ol className="space-y-1.5">
        {degraus.map((d, i) => {
          const anteriorN = i > 0 ? degraus[i - 1].n : null;
          const passou = anteriorN && anteriorN > 0 ? Math.round((d.n / anteriorN) * 100) : null;
          return (
            <li key={d.rotulo} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 text-fluid-xs sm:grid-cols-[8rem_minmax(0,1fr)_11rem]">
              <span className="text-corpo">{d.rotulo}</span>
              <span className="flex h-6 items-center">
                <span
                  className="flex h-full items-center justify-end rounded-r bg-acento px-2 font-semibold text-sobre-cor tabular-nums"
                  style={{ width: `${Math.max((d.n / topo) * 100, d.n > 0 ? 8 : 0)}%` }}
                >
                  {d.n > 0 ? d.n : ""}
                </span>
                {d.n === 0 && <span className="text-apoio">0</span>}
              </span>
              <span className="col-start-2 text-apoio tabular-nums sm:col-start-3 sm:text-right">
                {passou !== null && i > 0 ? `${passou}% do anterior` : ""}
                {d.custo !== null ? `${passou !== null && i > 0 ? " · " : ""}${reais(d.custo)} cada` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      {ind.sairam > 0 && <p className="text-fluid-xs text-apoio">{ind.sairam} saíram (pediram para parar ou foram marcados como perdidos).</p>}
    </figure>
  );
}
