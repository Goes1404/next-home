"use client";

import { useEffect, useRef, useState } from "react";
import { MINIMO_DE_CLIENTES_NA_SERIE, type PontoDaSerie } from "@/lib/crm/impulsionamentosCalculo";
import { CartaoDeGrafico } from "@/app/corretor/(painel)/_componentes/graficos/Moldura";

export type OpcaoDeSerie = { id: string; nome: string; serie: PontoDaSerie[] };

const ALTURA_LINHA = 180;
const ALTURA_BARRAS = 84;
const MARGEM = { topo: 14, direita: 16, base: 24, esquerda: 64 };

const reais = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const reaisExato = (v: number | null) =>
  v === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const diaCurto = (dia: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
    new Date(`${dia}T00:00:00Z`),
  );

/** Três ou quatro marcas redondas no eixo, do zero até acima do máximo. */
function marcasDoEixo(maximo: number): number[] {
  if (maximo <= 0) return [0];
  const bruto = maximo / 3;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  const marcas: number[] = [];
  for (let v = 0; v <= maximo + passo * 0.001; v += passo) marcas.push(v);
  if (marcas[marcas.length - 1] < maximo) marcas.push(marcas[marcas.length - 1] + passo);
  return marcas;
}

/** A frase do topo: o custo de agora contra o de 4 semanas antes. */
function manchete(serie: PontoDaSerie[]): React.ReactNode {
  const ultimo = serie[serie.length - 1];
  if (ultimo.custoMovel === null) {
    if (ultimo.clientes4 === 0 && ultimo.gasto4 > 0) {
      return (
        <>
          Nas últimas 4 semanas: <strong className="text-titulo">{reaisExato(ultimo.gasto4)}</strong> gastos e{" "}
          <strong className="text-titulo">nenhum cliente</strong>.
        </>
      );
    }
    return (
      <>
        O custo aparece a partir do {MINIMO_DE_CLIENTES_NA_SERIE}º cliente: antes disso, um cliente a mais ou a
        menos muda tudo.
      </>
    );
  }
  const antes = serie.length > 4 ? serie[serie.length - 5] : null;
  return (
    <>
      Agora: <strong className="text-fluid-lg text-titulo tabular-nums">{reaisExato(ultimo.custoMovel)}</strong> por
      cliente nas últimas 4 semanas
      {antes?.custoMovel != null && (
        <>
          {" · "}
          {ultimo.custoMovel < antes.custoMovel
            ? "caiu de"
            : ultimo.custoMovel > antes.custoMovel
              ? "subiu de"
              : "igual a"}{" "}
          {reaisExato(antes.custoMovel)} há um mês
        </>
      )}
    </>
  );
}

/**
 * Quanto está custando cada cliente, semana a semana (30/09/2026).
 *
 * Duas peças alinhadas pela mesma semana, cada uma com o próprio eixo (nunca
 * dois eixos no mesmo gráfico):
 *
 * - a LINHA é o custo por cliente das últimas 4 semanas. Ponto cheio: houve
 *   registro de gasto naquela semana. Ponto vazado: o gasto é estimado,
 *   distribuído por igual entre dois registros;
 * - as BARRAS são os clientes que chegaram em cada semana — número medido,
 *   que mostra se o volume está caindo.
 *
 * Uma campanha por vez (seletor): várias linhas pediriam uma cor por
 * campanha, e a comparação entre elas já tem o gráfico de barras de cima.
 */
export function CustoAoLongoDoTempo({ opcoes }: { opcoes: OpcaoDeSerie[] }) {
  const [escolhida, setEscolhida] = useState(opcoes[0]?.id ?? "");
  const [foco, setFoco] = useState<number | null>(null);
  // Zero até medir: começar com um número fixo faria a caixa medir o próprio
  // gráfico e crescer junto com ele, estourando a tela do celular.
  const [largura, setLargura] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const opcao = opcoes.find((o) => o.id === escolhida) ?? opcoes[0];
  if (!opcao) return null;
  const serie = opcao.serie;

  const seletor = (
    <label className="block space-y-1">
      <span className="block text-fluid-xs text-corpo">Campanha</span>
      <select
        value={opcao.id}
        onChange={(e) => {
          setEscolhida(e.target.value);
          setFoco(null);
        }}
        className="w-full rounded-xl border border-linha-forte bg-campo px-3 py-2.5 text-fluid-sm text-titulo outline-none select-seta sm:w-auto"
      >
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  );

  const semDado = serie.length === 0 || serie.every((p) => p.novos === 0 && p.custoMovel === null);

  const larguraUtil = Math.max(1, largura - MARGEM.esquerda - MARGEM.direita);
  const x = (i: number) =>
    MARGEM.esquerda + (serie.length === 1 ? larguraUtil / 2 : (i / (serie.length - 1)) * larguraUtil);

  const valores = serie.map((p) => p.custoMovel).filter((v): v is number => v !== null);
  const marcas = marcasDoEixo(valores.length ? Math.max(...valores) : 0);
  const topo = marcas[marcas.length - 1] || 1;
  const alturaLinha = ALTURA_LINHA - MARGEM.topo - 8;
  const y = (v: number) => MARGEM.topo + alturaLinha - (v / topo) * alturaLinha;

  // Semana sem custo interrompe a linha: ligar por cima dela inventaria o
  // que aconteceu no meio.
  const trechos: string[] = [];
  let trecho: string[] = [];
  serie.forEach((p, i) => {
    if (p.custoMovel === null) {
      if (trecho.length) trechos.push(trecho.join(" "));
      trecho = [];
    } else trecho.push(`${trecho.length ? "L" : "M"}${x(i)},${y(p.custoMovel)}`);
  });
  if (trecho.length) trechos.push(trecho.join(" "));

  const maxNovos = Math.max(1, ...serie.map((p) => p.novos));
  const alturaBarras = ALTURA_BARRAS - 6 - MARGEM.base;
  const larguraBarra = Math.max(4, Math.min(28, (larguraUtil / Math.max(1, serie.length)) * 0.6));

  // Quantas datas cabem sem encostar (~90px cada), sempre com a primeira e a
  // última; no celular sobram duas ou três, no computador quase todas.
  const cabem = Math.max(2, Math.floor(larguraUtil / 90));
  const passo = Math.max(1, Math.ceil((serie.length - 1) / (cabem - 1)));
  const rotulosX = serie
    .map((p, i) => ({ p, i }))
    // A última data é alinhada pela direita e ocupa ~90px à esquerda do ponto:
    // a vizinha que cair nesse trecho sai, senão as duas se encostam.
    .filter(({ i }) => i === serie.length - 1 || (i % passo === 0 && x(serie.length - 1) - x(i) >= 90));

  const escolherPeloPonteiro = (clienteX: number, rect: DOMRect) => {
    const px = ((clienteX - rect.left) / rect.width) * largura;
    let melhor = 0;
    for (let i = 1; i < serie.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    setFoco(melhor);
  };
  const eventos = {
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) =>
      escolherPeloPonteiro(e.clientX, e.currentTarget.getBoundingClientRect()),
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) =>
      escolherPeloPonteiro(e.clientX, e.currentTarget.getBoundingClientRect()),
    onPointerLeave: () => setFoco(null),
  };
  const atual = foco !== null ? serie[foco] : null;

  const guia = (altura: number) =>
    foco !== null && (
      <line x1={x(foco)} x2={x(foco)} y1={4} y2={altura} className="stroke-corpo" strokeWidth={1} strokeDasharray="3 3" />
    );

  return (
    <CartaoDeGrafico
      titulo="Quanto está custando cada cliente?"
      subtitulo="Custo por cliente nas últimas 4 semanas, medido no fim de cada semana. Embaixo, quantos clientes chegaram em cada semana."
      rodape="Entre um registro de gasto e outro, o valor é distribuído por igual pelos dias, como um orçamento diário. Registre o gasto de vez em quando, com o dia, para os pontos ficarem cheios."
    >
      {seletor}
      {semDado ? (
        <p className="rounded-xl border border-dashed border-linha px-4 py-6 text-center text-fluid-sm text-apoio">
          Ainda não chegou cliente por esta campanha no período. O gráfico aparece com os primeiros.
        </p>
      ) : (
        <>
          <p className="text-fluid-sm text-corpo">{manchete(serie)}</p>

          <div ref={caixa} className="relative w-full min-w-0 space-y-1">
            {largura > 0 && (
              <>
                <svg
                  width={largura}
                  height={ALTURA_LINHA}
                  role="img"
                  aria-label={`Custo por cliente nas últimas 4 semanas de ${opcao.nome}, semana a semana. A tabela abaixo tem os números.`}
                  className="block touch-pan-y"
                  {...eventos}
                >
                  {marcas.map((m) => (
                    <g key={m}>
                      <line
                        x1={MARGEM.esquerda}
                        x2={largura - MARGEM.direita}
                        y1={y(m)}
                        y2={y(m)}
                        className="stroke-linha"
                        strokeWidth={1}
                      />
                      <text
                        x={MARGEM.esquerda - 8}
                        y={y(m)}
                        textAnchor="end"
                        dominantBaseline="central"
                        className="fill-corpo"
                        style={{ fontSize: 11 }}
                      >
                        {reais(m)}
                      </text>
                    </g>
                  ))}
                  {guia(ALTURA_LINHA - 4)}
                  {trechos.map((d) => (
                    <path
                      key={d}
                      d={d}
                      fill="none"
                      className="stroke-acento"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {serie.map((p, i) =>
                    p.custoMovel === null ? null : (
                      <circle
                        key={p.dia}
                        cx={x(i)}
                        cy={y(p.custoMovel)}
                        r={foco === i ? 6 : 4.5}
                        strokeWidth={2}
                        className={p.informado ? "fill-acento stroke-superficie" : "fill-superficie stroke-acento"}
                      />
                    ),
                  )}
                </svg>

                <svg
                  width={largura}
                  height={ALTURA_BARRAS}
                  role="img"
                  aria-label={`Clientes que chegaram por semana em ${opcao.nome}.`}
                  className="block touch-pan-y"
                  {...eventos}
                >
                  <text
                    x={MARGEM.esquerda - 8}
                    y={6}
                    textAnchor="end"
                    dominantBaseline="hanging"
                    className="fill-corpo"
                    style={{ fontSize: 11 }}
                  >
                    {maxNovos}
                  </text>
                  <text
                    x={MARGEM.esquerda - 8}
                    y={6 + alturaBarras}
                    textAnchor="end"
                    dominantBaseline="central"
                    className="fill-corpo"
                    style={{ fontSize: 11 }}
                  >
                    0
                  </text>
                  <line
                    x1={MARGEM.esquerda}
                    x2={largura - MARGEM.direita}
                    y1={6 + alturaBarras}
                    y2={6 + alturaBarras}
                    className="stroke-linha"
                    strokeWidth={1}
                  />
                  {guia(6 + alturaBarras)}
                  {serie.map((p, i) => {
                    const h = (p.novos / maxNovos) * alturaBarras;
                    return p.novos === 0 ? null : (
                      <rect
                        key={p.dia}
                        x={x(i) - larguraBarra / 2}
                        y={6 + alturaBarras - h}
                        width={larguraBarra}
                        height={h}
                        rx={3}
                        className={foco === i ? "fill-acento" : "fill-acento/55"}
                      />
                    );
                  })}
                  {rotulosX.map(({ p, i }) => (
                    <text
                      key={p.dia}
                      x={x(i)}
                      y={ALTURA_BARRAS - 6}
                      textAnchor={i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}
                      className="fill-corpo"
                      style={{ fontSize: 11 }}
                    >
                      {diaCurto(p.dia)}
                    </text>
                  ))}
                </svg>
              </>
            )}

            {atual && foco !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-10 w-52 rounded-xl border border-linha-forte bg-elevado px-3 py-2 text-fluid-xs text-corpo shadow-lg"
                style={{ left: Math.min(Math.max(x(foco) - 104, 0), Math.max(0, largura - 208)) }}
              >
                <p className="font-semibold text-titulo">Semana até {diaCurto(atual.dia)}</p>
                <p>
                  Clientes na semana: <span className="font-semibold text-titulo tabular-nums">{atual.novos}</span>
                </p>
                <p className="mt-1">Últimas 4 semanas:</p>
                <p>
                  <span className="text-titulo tabular-nums">{reaisExato(atual.gasto4)}</span> ·{" "}
                  <span className="text-titulo tabular-nums">{atual.clientes4}</span>{" "}
                  {atual.clientes4 === 1 ? "cliente" : "clientes"}
                </p>
                <p>
                  Por cliente:{" "}
                  <span className="font-semibold text-titulo tabular-nums">{reaisExato(atual.custoMovel)}</span>
                </p>
                <p className="mt-1">{atual.informado ? "Gasto registrado nesta semana" : "Gasto estimado"}</p>
              </div>
            )}
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-fluid-xs text-corpo">
            <li className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden>
                <circle cx="6" cy="6" r="4.5" strokeWidth={2} className="fill-acento stroke-superficie" />
              </svg>
              Gasto registrado na semana
            </li>
            <li className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden>
                <circle cx="6" cy="6" r="4" strokeWidth={2} className="fill-superficie stroke-acento" />
              </svg>
              Gasto estimado
            </li>
          </ul>

          <details>
            <summary className="min-h-11 cursor-pointer text-fluid-sm font-semibold text-titulo">
              Ver em tabela
            </summary>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[30rem] text-fluid-sm">
                <caption className="sr-only">Custo por cliente de {opcao.nome}, semana a semana</caption>
                <thead>
                  <tr className="text-left text-fluid-xs text-corpo">
                    <th className="py-1 font-medium">Semana até</th>
                    <th className="py-1 text-right font-medium">Clientes na semana</th>
                    <th className="py-1 text-right font-medium">Gasto em 4 sem.</th>
                    <th className="py-1 text-right font-medium">Clientes em 4 sem.</th>
                    <th className="py-1 text-right font-medium">Por cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((p) => (
                    <tr key={p.dia} className="border-t border-linha text-titulo tabular-nums">
                      <td className="py-1.5">{diaCurto(p.dia)}</td>
                      <td className="py-1.5 text-right">{p.novos}</td>
                      <td className="py-1.5 text-right">
                        {reaisExato(p.gasto4)}
                        {!p.informado && <span className="text-corpo"> (est.)</span>}
                      </td>
                      <td className="py-1.5 text-right">{p.clientes4}</td>
                      <td className="py-1.5 text-right">{reaisExato(p.custoMovel)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </CartaoDeGrafico>
  );
}
