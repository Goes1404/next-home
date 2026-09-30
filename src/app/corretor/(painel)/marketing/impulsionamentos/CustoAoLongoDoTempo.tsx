"use client";

import { useEffect, useRef, useState } from "react";
import type { PontoDaSerie } from "@/lib/crm/impulsionamentosCalculo";
import { CartaoDeGrafico } from "@/app/corretor/(painel)/_componentes/graficos/Moldura";

export type OpcaoDeSerie = { id: string; nome: string; serie: PontoDaSerie[] };

const ALTURA = 220;
const MARGEM = { topo: 16, direita: 16, base: 28, esquerda: 64 };

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

/**
 * Quanto está custando cada cliente, semana a semana (30/09/2026).
 *
 * Uma linha só por vez: o seletor escolhe a campanha. Várias linhas coloridas
 * no mesmo gráfico exigiriam uma cor por campanha, e o que se quer aqui é ver
 * para onde UMA vai — a comparação entre elas já tem o gráfico de cima.
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
  const comValor = serie.filter((p) => p.custoPorCliente !== null);

  const cabecalho = (
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

  const moldura = (conteudo: React.ReactNode) => (
    <CartaoDeGrafico
      titulo="Quanto está custando cada cliente?"
      subtitulo="Custo por cliente acumulado no fim de cada semana: tudo o que foi gasto até ali, dividido por todos os clientes que chegaram até ali."
      rodape="Entre um registro de gasto e outro, o valor é distribuído por igual pelos dias, como um orçamento diário. Para a linha ficar exata, registre o gasto de vez em quando, com o dia."
    >
      {cabecalho}
      {conteudo}
    </CartaoDeGrafico>
  );

  if (comValor.length === 0) {
    return moldura(
      <p className="rounded-xl border border-dashed border-linha px-4 py-6 text-center text-fluid-sm text-apoio">
        Ainda não há cliente com gasto informado nesse período. O gráfico aparece com o primeiro.
      </p>,
    );
  }

  const larguraUtil = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
  const marcas = marcasDoEixo(Math.max(...comValor.map((p) => p.custoPorCliente as number)));
  const topo = marcas[marcas.length - 1] || 1;
  const x = (i: number) => MARGEM.esquerda + (serie.length === 1 ? larguraUtil / 2 : (i / (serie.length - 1)) * larguraUtil);
  const y = (v: number) => MARGEM.topo + alturaUtil - (v / topo) * alturaUtil;

  // Semana sem cliente ainda não tem custo: a linha começa no primeiro ponto
  // com valor, em vez de desenhar um zero que pareceria custo baixo.
  const caminho = serie
    .map((p, i) => (p.custoPorCliente === null ? null : `${x(i)},${y(p.custoPorCliente)}`))
    .filter(Boolean)
    .map((ponto, i) => `${i === 0 ? "M" : "L"}${ponto}`)
    .join(" ");

  // Quantas datas cabem sem encostar (~90px cada), sempre com a primeira e a
  // última; no celular sobram três, no computador todas.
  const cabem = Math.max(2, Math.floor(larguraUtil / 90));
  const passo = Math.max(1, Math.ceil((serie.length - 1) / (cabem - 1)));
  const rotulosX = serie
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i === serie.length - 1 || (i % passo === 0 && serie.length - 1 - i >= passo / 2));

  const escolherPeloPonteiro = (clienteX: number, rect: DOMRect) => {
    const px = ((clienteX - rect.left) / rect.width) * largura;
    let melhor = 0;
    for (let i = 1; i < serie.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i;
    setFoco(melhor);
  };

  const atual = foco !== null ? serie[foco] : null;
  const ultimo = comValor[comValor.length - 1];
  const primeiroComValor = comValor[0];
  const variacao =
    comValor.length > 1 && primeiroComValor.custoPorCliente
      ? Math.round((((ultimo.custoPorCliente as number) - primeiroComValor.custoPorCliente) / primeiroComValor.custoPorCliente) * 100)
      : null;

  return moldura(
    <>
      <p className="text-fluid-sm text-corpo">
        Agora: <strong className="text-fluid-lg text-titulo tabular-nums">{reaisExato(ultimo.custoPorCliente)}</strong> por
        cliente
        {variacao !== null && variacao !== 0 && (
          <>
            {" · "}
            {variacao < 0 ? `${Math.abs(variacao)}% mais barato` : `${variacao}% mais caro`} que em{" "}
            {diaCurto(primeiroComValor.dia)}
          </>
        )}
      </p>

      <div ref={caixa} className="relative w-full min-w-0">
        {largura > 0 && (
        <svg
          width={largura}
          height={ALTURA}
          role="img"
          aria-label={`Custo por cliente de ${opcao.nome}, semana a semana. Agora ${reaisExato(ultimo.custoPorCliente)}. A tabela abaixo tem os números.`}
          className="block touch-pan-y"
          onPointerMove={(e) => escolherPeloPonteiro(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => escolherPeloPonteiro(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setFoco(null)}
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
              <text x={MARGEM.esquerda - 8} y={y(m)} textAnchor="end" dominantBaseline="central" className="fill-corpo" style={{ fontSize: 11 }}>
                {reais(m)}
              </text>
            </g>
          ))}
          {rotulosX.map(({ p, i }) => (
            <text
              key={p.dia}
              x={x(i)}
              y={ALTURA - 8}
              textAnchor={i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}
              className="fill-corpo"
              style={{ fontSize: 11 }}
            >
              {diaCurto(p.dia)}
            </text>
          ))}
          {atual && foco !== null && (
            <line
              x1={x(foco)}
              x2={x(foco)}
              y1={MARGEM.topo}
              y2={MARGEM.topo + alturaUtil}
              className="stroke-corpo"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          <path d={caminho} fill="none" className="stroke-acento" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {serie.map((p, i) =>
            p.custoPorCliente === null ? null : (
              <circle
                key={p.dia}
                cx={x(i)}
                cy={y(p.custoPorCliente)}
                r={foco === i ? 6 : 4}
                className="fill-acento stroke-superficie"
                strokeWidth={2}
              />
            ),
          )}
        </svg>
        )}

        {atual && foco !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-linha-forte bg-elevado px-3 py-2 text-fluid-xs text-corpo shadow-lg"
            style={{
              left: Math.min(Math.max(x(foco) - 88, 0), largura - 176),
            }}
          >
            <p className="font-semibold text-titulo">Até {diaCurto(atual.dia)}</p>
            <p>
              Por cliente: <span className="font-semibold text-titulo tabular-nums">{reaisExato(atual.custoPorCliente)}</span>
            </p>
            <p>
              Gasto: <span className="text-titulo tabular-nums">{reaisExato(atual.gasto)}</span>
            </p>
            <p>
              Clientes: <span className="text-titulo tabular-nums">{atual.clientes}</span>
            </p>
          </div>
        )}
      </div>

      <details>
        <summary className="min-h-11 cursor-pointer text-fluid-sm font-semibold text-titulo">Ver em tabela</summary>
        <table className="mt-2 w-full text-fluid-sm">
          <caption className="sr-only">Custo por cliente de {opcao.nome}, semana a semana</caption>
          <thead>
            <tr className="text-left text-fluid-xs text-corpo">
              <th className="py-1 font-medium">Até</th>
              <th className="py-1 text-right font-medium">Gasto</th>
              <th className="py-1 text-right font-medium">Clientes</th>
              <th className="py-1 text-right font-medium">Por cliente</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.dia} className="border-t border-linha text-titulo tabular-nums">
                <td className="py-1.5">{diaCurto(p.dia)}</td>
                <td className="py-1.5 text-right">{reaisExato(p.gasto)}</td>
                <td className="py-1.5 text-right">{p.clientes}</td>
                <td className="py-1.5 text-right">{reaisExato(p.custoPorCliente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>,
  );
}
