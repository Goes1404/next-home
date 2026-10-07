"use client";

import { useMemo, useState } from "react";
import { reaisCurto } from "@/lib/financeiro/painelDeVendas";
import {
  corretoresDoPeriodo,
  imoveisDoPeriodo,
  indicadoresDosMeses,
  janelaDeMeses,
  olharDe,
  OUTROS,
  PERIODOS_DE_VENDAS,
  rotuloDoMes,
  serieMensal,
  variacaoDe,
  type FatiaDeImovel,
  type IndicadoresDeVendas,
  type LinhaDeCorretor,
  type MesDoIndicador,
  type PeriodoDeVendas,
  type VendaDoIndicador,
} from "@/lib/financeiro/indicadoresDeVendas";

/**
 * Painel de vendas no estilo Power BI (07/10/2026): período, imóvel e, para o
 * gestor, corretor numa linha em cima; números, gráficos e ranking embaixo,
 * recalculados a cada toque. A rosca e o ranking também filtram.
 *
 * A cor segue o IMÓVEL (pelo ranking de todas as vendas), nunca a posição no
 * período, então trocar o período não repinta ninguém. "Outros" é cinza.
 * Todo gráfico tem o número escrito ao lado ou a tabela, porque três tons da
 * paleta ficam abaixo de 3:1 no tema claro.
 */

const COR: Record<number, { bg: string; stroke: string }> = {
  1: { bg: "bg-serie-1", stroke: "stroke-serie-1" },
  2: { bg: "bg-serie-2", stroke: "stroke-serie-2" },
  3: { bg: "bg-serie-3", stroke: "stroke-serie-3" },
  4: { bg: "bg-serie-4", stroke: "stroke-serie-4" },
  5: { bg: "bg-serie-5", stroke: "stroke-serie-5" },
};
const COR_OUTROS = { bg: "bg-tenue", stroke: "stroke-tenue" };
const corDe = (cor: number | null) => (cor ? COR[cor] : COR_OUTROS);

const reais = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/** No cartão, acima de R$ 1 milhão o valor vira "R$ 9,9 mi": o número inteiro quebrava linha no celular. */
const reaisDoCartao = (v: number | null) => (v !== null && v >= 1_000_000 ? reaisCurto(v) : reais(v));
const contagem = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR"));

const CHIP = "min-h-10 rounded-full border px-3.5 text-fluid-xs font-semibold transition-colors inline-flex items-center gap-2";
const CHIP_ATIVO = "border-acento bg-acento text-sobre-cor";
const CHIP_INATIVO = "border-linha-forte text-titulo hover:bg-vidro";

export function PainelDeVendas({
  vendas,
  hoje,
  escopo,
}: {
  vendas: VendaDoIndicador[];
  hoje: string;
  /** O corretor logado; null para o gestor, que vê a equipe. */
  escopo: string | null;
}) {
  const gestor = escopo === null;
  const [periodo, setPeriodo] = useState<PeriodoDeVendas>(6);
  const [imovel, setImovel] = useState<string | null>(null);
  const [corretorId, setCorretorId] = useState<string | null>(null);

  const olhar = olharDe(escopo, { periodo, imovel, corretorId });
  const janela = useMemo(() => janelaDeMeses(hoje, periodo), [hoje, periodo]);
  const filtroImovel = imovel === OUTROS ? null : imovel;
  const atual = useMemo(() => indicadoresDosMeses(vendas, janela.meses, olhar, filtroImovel), [vendas, janela, olhar, filtroImovel]);
  const anterior = useMemo(() => indicadoresDosMeses(vendas, janela.anterior, olhar, filtroImovel), [vendas, janela, olhar, filtroImovel]);
  const serie = useMemo(() => serieMensal(vendas, hoje, janela, olhar, filtroImovel), [vendas, hoje, janela, olhar, filtroImovel]);
  const fatias = useMemo(() => imoveisDoPeriodo(vendas, janela.meses, olhar), [vendas, janela, olhar]);
  const corretores = useMemo(
    () => (gestor ? corretoresDoPeriodo(vendas, janela.meses, filtroImovel) : []),
    [gestor, vendas, janela, filtroImovel],
  );
  const nomeDoCorretor = useMemo(() => {
    for (const v of vendas) for (const p of v.participantes) if (p.corretorId === corretorId) return p.nome;
    return null;
  }, [vendas, corretorId]);

  const alternarImovel = (i: string) => setImovel((a) => (a === i || i === OUTROS ? null : i));
  const alternarCorretor = (c: string) => setCorretorId((a) => (a === c ? null : c));
  const quem = gestor ? (nomeDoCorretor ? `de ${nomeDoCorretor}` : "da equipe") : "seu";

  return (
    <section className="cartao mt-4 space-y-5 p-4 sm:p-5" aria-labelledby="painel-vendas-titulo">
      <header className="space-y-3">
        <div>
          <h2 id="painel-vendas-titulo" className="text-fluid-base font-medium text-titulo">
            Painel de vendas
          </h2>
          <p className="mt-1 text-fluid-xs text-apoio">
            {rotuloDoMes(janela.meses[0])}
            {janela.meses.length > 1 ? ` a ${rotuloDoMes(janela.meses[janela.meses.length - 1])}` : ""}
            {` · VGV ${quem}`}
            {imovel && imovel !== OUTROS ? ` · só ${imovel}` : ""}
            {periodo === "ano" ? " · comparado ao mesmo trecho do ano passado" : " · comparado ao período anterior"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
          {PERIODOS_DE_VENDAS.map((p) => (
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
        {(imovel || corretorId) && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros ativos">
            {imovel && (
              <button type="button" onClick={() => setImovel(null)} className={`${CHIP} ${CHIP_INATIVO}`}>
                Imóvel: {imovel} <span aria-hidden>×</span>
                <span className="sr-only">tirar filtro</span>
              </button>
            )}
            {corretorId && (
              <button type="button" onClick={() => setCorretorId(null)} className={`${CHIP} ${CHIP_INATIVO}`}>
                Corretor: {nomeDoCorretor} <span aria-hidden>×</span>
                <span className="sr-only">tirar filtro</span>
              </button>
            )}
          </div>
        )}
      </header>

      <Cartoes atual={atual} anterior={anterior} serie={serie} gestor={gestor && !corretorId} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
        <ColunasPorMes serie={serie} />
        <Rosca fatias={fatias} imovel={imovel} alternar={alternarImovel} />
      </div>

      <div className={`grid gap-4 [&>*]:min-w-0 ${gestor ? "lg:grid-cols-2" : ""}`}>
        <BarraDaComissao comissao={atual.comissao} equipe={gestor && !corretorId} />
        {gestor && <RankingDeCorretores linhas={corretores} ativo={corretorId} alternar={alternarCorretor} />}
      </div>
    </section>
  );
}

/* ── Cartões de indicador ─────────────────────────────────────────────── */

type DefCartao = {
  rotulo: string;
  valor: (i: IndicadoresDeVendas) => number | null;
  formato: (v: number | null) => string;
  /** Variação sem juízo: "a receber" crescer não é bom nem ruim. */
  neutro?: boolean;
};

function definicoes(gestor: boolean): DefCartao[] {
  return [
    { rotulo: "VGV", valor: (i) => i.vgv, formato: reaisDoCartao },
    { rotulo: "Vendas", valor: (i) => i.vendas, formato: contagem },
    { rotulo: "Ticket médio", valor: (i) => i.ticketMedio, formato: reaisDoCartao },
    { rotulo: gestor ? "Comissão da imobiliária" : "Sua comissão", valor: (i) => i.comissao.total, formato: reaisDoCartao },
    { rotulo: "Comissão recebida", valor: (i) => i.comissao.recebida, formato: reaisDoCartao },
    { rotulo: "A receber", valor: (i) => i.comissao.liberada + i.comissao.aguardando, formato: reaisDoCartao, neutro: true },
  ];
}

function Cartoes({ atual, anterior, serie, gestor }: { atual: IndicadoresDeVendas; anterior: IndicadoresDeVendas; serie: MesDoIndicador[]; gestor: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {definicoes(gestor).map((c) => {
        const v = c.valor(atual);
        const delta = variacaoDe(v, c.valor(anterior));
        const bom = c.neutro || delta === null || delta === 0 ? null : delta > 0;
        return (
          <div key={c.rotulo} className="min-w-0 rounded-2xl border border-linha bg-vidro p-3">
            <dt className="text-fluid-xs text-apoio">{c.rotulo}</dt>
            <dd className="mt-1 space-y-1">
              <span title={reais(v)} className="block font-display text-xl leading-none font-bold tracking-[-0.02em] text-titulo tabular-nums whitespace-nowrap sm:text-2xl">
                {c.formato(v)}
              </span>
              {delta !== null ? (
                <span className={`block text-fluid-xs font-semibold ${bom === null ? "text-apoio" : bom ? "text-ok" : "text-perigo"}`}>
                  <span aria-hidden>{delta > 0 ? "▲" : delta < 0 ? "▼" : "•"}</span> {Math.abs(delta)}%
                  <span className="font-normal text-apoio"> vs anterior</span>
                </span>
              ) : (
                <span className="block text-fluid-xs text-apoio">sem base anterior</span>
              )}
              <Sparkline valores={serie.map((m) => c.valor(m))} rotulo={c.rotulo} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Sparkline({ valores, rotulo }: { valores: (number | null)[]; rotulo: string }) {
  const pts = valores.map((v, i) => ({ i, v: v ?? 0 }));
  if (pts.length < 2 || pts.every((p) => p.v === 0)) return <span className="block h-7" aria-hidden />;
  const max = Math.max(...pts.map((p) => p.v), 1);
  const n = valores.length - 1 || 1;
  const caminho = pts.map((p) => `${((p.i / n) * 100).toFixed(1)},${(26 - (p.v / max) * 22).toFixed(1)}`).join(" ");
  const ultimo = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="block h-7 w-full text-acento" role="img" aria-label={`Tendência mensal de ${rotulo}`}>
      <polyline points={caminho} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(ultimo.i / n) * 100} cy={26 - (ultimo.v / max) * 22} r={2.5} fill="currentColor" />
    </svg>
  );
}

/* ── Colunas: VGV por mês ─────────────────────────────────────────────── */

function ColunasPorMes({ serie }: { serie: MesDoIndicador[] }) {
  const [ativa, setAtiva] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const maior = Math.max(1, ...serie.map((m) => m.vgv));
  const mostrarRotulo = (i: number) => serie.length <= 6 || i % 2 === (serie.length - 1) % 2;

  return (
    <figure className="min-w-0 space-y-3 rounded-2xl border border-linha p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="text-fluid-sm font-semibold text-titulo">VGV por mês</figcaption>
        <button type="button" onClick={() => setTabela((t) => !t)} className="min-h-10 rounded-lg px-2 text-fluid-xs text-acento-forte underline decoration-transparent hover:decoration-current">
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {tabela ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-fluid-xs">
            <thead>
              <tr className="text-left text-apoio">
                <th className="py-1 font-medium">Mês</th>
                <th className="py-1 text-right font-medium">VGV</th>
                <th className="py-1 text-right font-medium">Vendas</th>
                <th className="py-1 text-right font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {[...serie].reverse().map((m) => (
                <tr key={m.mes} className="border-t border-linha text-titulo tabular-nums">
                  <td className="py-1.5">{m.rotulo}</td>
                  <td className="py-1.5 text-right">{reais(m.vgv)}</td>
                  <td className="py-1.5 text-right">{m.vendas}</td>
                  <td className="py-1.5 text-right">{reais(m.comissao.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <ol className="flex h-44 items-end gap-1 sm:gap-2" aria-label="VGV por mês">
            {serie.map((m, i) => {
              const altura = m.vgv > 0 ? Math.max(4, (m.vgv / maior) * 100) : 0;
              return (
                <li
                  key={m.mes}
                  className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  onMouseEnter={() => setAtiva(i)}
                  onMouseLeave={() => setAtiva(null)}
                  onFocus={() => setAtiva(i)}
                  onBlur={() => setAtiva(null)}
                  tabIndex={0}
                  aria-label={`${m.rotulo}: ${reais(m.vgv)} em ${m.vendas} vendas`}
                >
                  <span className={`mb-0.5 text-fluid-xs whitespace-nowrap tabular-nums ${m.vgv === maior || i === serie.length - 1 ? "font-bold text-titulo" : "text-transparent"}`}>
                    {m.vgv > 0 ? reaisCurto(m.vgv).replace("R$ ", "") : ""}
                  </span>
                  <span
                    className={`block w-full max-w-10 rounded-t ${m.noPeriodo ? "bg-acento" : "bg-vidro-forte"} ${ativa !== null && ativa !== i ? "opacity-60" : ""}`}
                    style={{ height: `${altura}%` }}
                  />
                </li>
              );
            })}
          </ol>
          {ativa !== null && serie[ativa] && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-linha bg-elevado p-2.5 text-fluid-xs shadow-lg"
              style={{ left: `clamp(0px, calc(${((ativa + 0.5) / serie.length) * 100}% - 5.5rem), calc(100% - 11rem))` }}
            >
              <p className="font-semibold text-titulo">{serie[ativa].rotulo}</p>
              <p className="text-titulo tabular-nums">{reais(serie[ativa].vgv)}</p>
              <p className="text-corpo tabular-nums">
                {serie[ativa].vendas} {serie[ativa].vendas === 1 ? "venda" : "vendas"} · comissão {reais(serie[ativa].comissao.total)}
              </p>
            </div>
          )}
          <ol className="mt-1 flex gap-1 border-t border-linha pt-1 sm:gap-2" aria-hidden>
            {serie.map((m, i) => (
              <li key={m.mes} className={`flex-1 text-center text-fluid-xs ${m.noPeriodo ? "font-bold text-titulo" : "text-tenue"}`}>
                {mostrarRotulo(i) ? m.rotulo.slice(0, 3) : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-fluid-xs text-apoio">As colunas cheias são os meses do período escolhido.</p>
    </figure>
  );
}

/* ── Rosca: VGV por imóvel ───────────────────────────────────────────── */

function Rosca({ fatias, imovel, alternar }: { fatias: FatiaDeImovel[]; imovel: string | null; alternar: (i: string) => void }) {
  const total = fatias.reduce((s, f) => s + f.vgv, 0);
  const R = 15.9155;
  const inicios = fatias.map((_, i) => fatias.slice(0, i).reduce((s, f) => s + (f.vgv / total) * 100, 0));
  return (
    <figure className="min-w-0 space-y-3 rounded-2xl border border-linha p-3">
      <figcaption className="text-fluid-sm font-semibold text-titulo">VGV por imóvel</figcaption>
      {total === 0 ? (
        <p className="text-fluid-xs text-apoio">Nenhuma venda no período.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
          <svg viewBox="0 0 42 42" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`VGV total ${reais(total)}`}>
            <circle cx="21" cy="21" r={R} fill="none" className="stroke-vidro-forte" strokeWidth="6" />
            {fatias.map((f, i) => {
              const parte = (f.vgv / total) * 100;
              const apagada = imovel !== null && imovel !== f.imovel;
              const tamanho = fatias.length > 1 ? Math.max(parte - 0.8, 0.4) : 100;
              return (
                <circle
                  key={f.imovel}
                  cx="21"
                  cy="21"
                  r={R}
                  fill="none"
                  strokeWidth="6"
                  className={`${corDe(f.cor).stroke} ${f.cor ? "cursor-pointer" : ""} transition-opacity ${apagada ? "opacity-25" : ""}`}
                  strokeDasharray={`${tamanho} ${100 - tamanho}`}
                  strokeDashoffset={-inicios[i]}
                  onClick={() => alternar(f.imovel)}
                >
                  <title>{`${f.imovel}: ${reais(f.vgv)} (${Math.round(parte)}%)`}</title>
                </circle>
              );
            })}
            <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="fill-titulo text-[5px] font-bold" transform="rotate(90 21 21)">
              {reaisCurto(total)}
            </text>
          </svg>
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {fatias.map((f) => (
              <li key={f.imovel}>
                <button
                  type="button"
                  disabled={!f.cor}
                  onClick={() => alternar(f.imovel)}
                  aria-pressed={imovel === f.imovel}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-fluid-xs enabled:hover:bg-vidro ${imovel !== null && imovel !== f.imovel ? "opacity-50" : ""}`}
                >
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${corDe(f.cor).bg}`} />
                  <span className="min-w-0 flex-1 truncate text-titulo">{f.imovel}</span>
                  <span className="shrink-0 font-semibold text-titulo tabular-nums">{Math.round((f.vgv / total) * 100)}%</span>
                  <span className="shrink-0 text-apoio tabular-nums">{reaisCurto(f.vgv)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

/* ── Comissão em três estados ────────────────────────────────────────── */

function BarraDaComissao({ comissao, equipe }: { comissao: IndicadoresDeVendas["comissao"]; equipe: boolean }) {
  const partes = [
    { chave: "recebida", rotulo: equipe ? "Recebida da construtora" : "Já recebida", valor: comissao.recebida, cor: "bg-ok" },
    { chave: "liberada", rotulo: "Liberada para pagar", valor: comissao.liberada, cor: "bg-acento" },
    { chave: "aguardando", rotulo: "Aguardando a construtora", valor: comissao.aguardando, cor: "bg-alerta" },
  ].filter((p) => p.valor > 0);
  const recebidaPct = comissao.total > 0 ? Math.round((comissao.recebida / comissao.total) * 100) : 0;
  return (
    <figure className="min-w-0 space-y-3 rounded-2xl border border-linha p-3">
      <figcaption className="text-fluid-sm font-semibold text-titulo">Quanto da comissão do período já entrou?</figcaption>
      {comissao.total === 0 ? (
        <p className="text-fluid-xs text-apoio">Sem comissão nas vendas do período.</p>
      ) : (
        <>
          <p className="text-fluid-sm text-corpo">
            <span className="text-fluid-xl font-bold text-titulo">{recebidaPct}%</span> de {reais(comissao.total)} já entrou
          </p>
          <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${reais(p.valor)}`).join("; ")}>
            {partes.map((p) => (
              <span key={p.chave} className={`${p.cor} h-full`} style={{ width: `${(p.valor / comissao.total) * 100}%` }} title={`${p.rotulo}: ${reais(p.valor)}`} />
            ))}
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {partes.map((p) => (
              <li key={p.chave} className="flex items-start gap-2">
                <span className={`${p.cor} mt-1.5 size-2.5 shrink-0 rounded-full`} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-fluid-xs text-apoio">{p.rotulo}</span>
                  <span className="text-fluid-sm font-bold text-titulo">{reais(p.valor)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}

/* ── Ranking dos corretores (gestor) ─────────────────────────────────── */

function RankingDeCorretores({ linhas, ativo, alternar }: { linhas: LinhaDeCorretor[]; ativo: string | null; alternar: (c: string) => void }) {
  const maior = linhas[0]?.vgv ?? 0;
  return (
    <figure className="min-w-0 space-y-3 rounded-2xl border border-linha p-3">
      <figcaption className="text-fluid-sm font-semibold text-titulo">VGV por corretor</figcaption>
      {linhas.length === 0 ? (
        <p className="text-fluid-xs text-apoio">Nenhuma venda no período.</p>
      ) : (
        <ol className="space-y-1">
          {linhas.slice(0, 8).map((l, i) => (
            <li key={l.corretorId}>
              <button
                type="button"
                onClick={() => alternar(l.corretorId)}
                aria-pressed={ativo === l.corretorId}
                className={`w-full space-y-1 rounded-lg px-2 py-1.5 text-left hover:bg-vidro ${ativo !== null && ativo !== l.corretorId ? "opacity-50" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-fluid-sm font-medium text-titulo">
                    <span className="mr-1.5 text-tenue">{i + 1}.</span>
                    {l.nome}
                  </span>
                  <span className="shrink-0 text-fluid-xs text-apoio">
                    <span className="font-bold text-titulo">{reaisCurto(l.vgv)}</span> · {l.vendas} {l.vendas === 1 ? "venda" : "vendas"}
                  </span>
                </span>
                <span className="block h-2 w-full overflow-hidden rounded-full bg-vidro-forte">
                  <span className="block h-full rounded-full bg-acento" style={{ width: `${Math.max(3, (l.vgv / maior) * 100)}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="text-fluid-xs text-apoio">Toque num corretor para ver o painel como ele vê.</p>
    </figure>
  );
}
