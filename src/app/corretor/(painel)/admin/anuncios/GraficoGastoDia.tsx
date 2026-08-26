import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";

/**
 * Barras de investimento por dia — um gráfico, uma medida, um eixo.
 *
 * O CPL NÃO entra aqui em cima de propósito (segundo eixo é o erro nº 1 de
 * gráfico): ele mora nos cartões e na tabela por campanha, onde tem
 * denominador visível do lado.
 *
 * SVG servido do servidor, sem biblioteca: o painel é zeloso com peso no
 * celular, e barras + grade não precisam de runtime nenhum. O hover é o
 * <title> nativo de cada barra.
 */
export function GraficoGastoDia({ dias }: { dias: { rotulo: string; valor: number }[] }) {
  const largura = 720;
  const altura = 180;
  const margem = { topo: 18, base: 22 };
  const areaUtil = altura - margem.topo - margem.base;
  const maximo = Math.max(...dias.map((d) => d.valor), 1);
  const passo = largura / Math.max(dias.length, 1);
  const larguraBarra = Math.max(4, Math.min(18, passo - 2)); // 2px de respiro entre barras
  const indiceMaximo = dias.reduce((melhor, d, i) => (d.valor > dias[melhor].valor ? i : melhor), 0);
  const temDados = dias.some((d) => d.valor > 0);

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="w-full"
      role="img"
      aria-label="Investimento em anúncios por dia, últimos 30 dias"
    >
      {/* Grade recessiva: três linhas, sem números disputando com as barras. */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={largura}
          y1={margem.topo + areaUtil * (1 - f)}
          y2={margem.topo + areaUtil * (1 - f)}
          stroke="currentColor"
          strokeOpacity={0.08}
        />
      ))}
      <line
        x1={0}
        x2={largura}
        y1={margem.topo + areaUtil}
        y2={margem.topo + areaUtil}
        stroke="currentColor"
        strokeOpacity={0.25}
      />

      {dias.map((d, i) => {
        const alturaBarra = d.valor <= 0 ? 0 : Math.max(2, (d.valor / maximo) * areaUtil);
        const x = i * passo + (passo - larguraBarra) / 2;
        const y = margem.topo + areaUtil - alturaBarra;
        const ehMaximo = temDados && i === indiceMaximo && d.valor > 0;
        return (
          <g key={d.rotulo}>
            {alturaBarra > 0 && (
              <rect
                x={x}
                y={y}
                width={larguraBarra}
                height={alturaBarra}
                rx={3}
                fill="var(--color-brand-400)"
              >
                <title>{`${d.rotulo} — ${formatarMoedaBRL(d.valor)}`}</title>
              </rect>
            )}
            {/* Rótulo direto só no pico: número em toda barra vira ruído. */}
            {ehMaximo && (
              <text
                x={Math.min(largura - 4, Math.max(30, x + larguraBarra / 2))}
                y={Math.max(12, y - 5)}
                textAnchor="middle"
                className="fill-current text-[11px] tabular-nums"
              >
                {formatarMoedaBRL(d.valor)}
              </text>
            )}
            {/* Eixo do tempo: só primeira, meio e última data, recessivas. */}
            {(i === 0 || i === dias.length - 1 || i === Math.floor(dias.length / 2)) && (
              <text
                x={x + larguraBarra / 2}
                y={altura - 6}
                textAnchor={i === 0 ? "start" : i === dias.length - 1 ? "end" : "middle"}
                className="fill-current text-[10px] opacity-60"
              >
                {d.rotulo}
              </text>
            )}
          </g>
        );
      })}

      {!temDados && (
        <text
          x={largura / 2}
          y={margem.topo + areaUtil / 2}
          textAnchor="middle"
          className="fill-current text-[13px] opacity-60"
        >
          Sem gasto sincronizado ainda — conecte o Meta pelo passo a passo abaixo.
        </text>
      )}
    </svg>
  );
}
