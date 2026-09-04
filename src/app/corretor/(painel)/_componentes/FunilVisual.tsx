import Link from "next/link";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

/**
 * O funil desenhado como FUNIL — faixas que estreitam, uma por etapa.
 *
 * Referência do usuário (04/09/2026): o funil de vendas clássico, em bandas
 * coloridas com volume, do topo largo ao bico, sobre um alvo. Aqui as bandas
 * são as etapas REAIS do processo — novo → contatei → visita → documentação →
 * fechado — e a cor de cada uma é a MESMA que o quadro, a lista e a ficha já
 * usam (`--color-etapa-*`). Inventar a paleta da referência quebraria a
 * leitura que o resto do painel ensinou: cor de etapa é vocabulário.
 *
 * ## Os efeitos, e por que cada um está aqui
 *
 * - **Gradiente por banda + brilho na borda de cima**: é o que dá volume de
 *   "anel" à banda, como na referência. O gradiente sai da PRÓPRIA cor da
 *   etapa (`var(--color-etapa-*)` nos stops), então acompanha tema e paleta.
 * - **Sombra entre as bandas** (filtro SVG): separa uma da outra sem borda
 *   preta — borda mata a sensação de peça empilhada.
 * - **Entrada uma a uma** (`.funil-banda`, 90ms de escalonamento): o funil se
 *   monta do topo ao bico ao abrir a tela. Desligada em
 *   `prefers-reduced-motion`. É CSS puro, sem JS, sem GSAP.
 * - **Alvo sob o bico**: três anéis finos — é para onde o funil aponta.
 *
 * ## A geometria é de funil, não de gráfico
 *
 * A largura de cada banda é FIXA (decresce em passos iguais), não proporcional
 * à contagem. Proporcional viraria gráfico de barras deitado: com 46 em
 * "contatei" e 1 em "visita", a banda de visita sumiria. O número vai escrito
 * dentro; a forma diz "isto é um caminho".
 *
 * O bico NÃO pode ser fino como o da referência: "Documentação 0" precisa
 * caber DENTRO da banda — medido texto contra banda, não a olho.
 *
 * "Perdido" fica FORA do funil, como nota embaixo: não é um passo do caminho,
 * é a saída dele. Cada banda leva à lista já filtrada (`?etapa=`).
 */

const CAMINHO: EtapaFunil[] = ["novo", "primeiro_contato", "visita_agendada", "documentacao", "fechado"];

/** Token de cor da etapa — vai para o `stop-color` do gradiente da banda. */
const TOKEN: Record<EtapaFunil, string> = {
  novo: "var(--color-etapa-novo)",
  primeiro_contato: "var(--color-etapa-contato)",
  visita_agendada: "var(--color-etapa-visita)",
  documentacao: "var(--color-etapa-doc)",
  fechado: "var(--color-etapa-fechado)",
  perdido: "var(--color-etapa-perdido)",
};

const LARGURA = 400;
const ALTURA_BANDA = 46;
const VAO = 7;
const MEIAS = [196, 170, 144, 118, 92];
const BICO = 70;
/** Espaço abaixo do bico para o alvo. */
const ALVO_ALTURA = 34;

function banda(i: number) {
  const y = i * (ALTURA_BANDA + VAO);
  const topo = MEIAS[i];
  const base = MEIAS[i + 1] ?? BICO;
  const cx = LARGURA / 2;
  const d = `M ${cx - topo} ${y} L ${cx + topo} ${y} L ${cx + base} ${y + ALTURA_BANDA} L ${cx - base} ${y + ALTURA_BANDA} Z`;
  // Brilho: a metade de cima da banda, um pouco mais estreita — a "borda do anel".
  const meioTopo = topo - (topo - base) * 0.45;
  const brilho = `M ${cx - topo} ${y} L ${cx + topo} ${y} L ${cx + meioTopo} ${y + ALTURA_BANDA * 0.45} L ${cx - meioTopo} ${y + ALTURA_BANDA * 0.45} Z`;
  return { d, brilho, y, cx };
}

export function FunilVisual({ contagens }: { contagens: Record<EtapaFunil, number> }) {
  const alturaBandas = CAMINHO.length * (ALTURA_BANDA + VAO) - VAO;
  const alturaTotal = alturaBandas + ALVO_ALTURA;
  const perdidos = contagens.perdido ?? 0;
  const cx = LARGURA / 2;

  return (
    <div>
      <svg
        viewBox={`0 0 ${LARGURA} ${alturaTotal}`}
        role="img"
        aria-label={`Funil: ${CAMINHO.map((e) => `${ETAPA_LABEL[e]} ${contagens[e] ?? 0}`).join(", ")}`}
        className="mx-auto block w-full max-w-md overflow-visible"
      >
        <defs>
          {CAMINHO.map((etapa) => (
            <linearGradient key={etapa} id={`funil-${etapa}`} x1="0" y1="0" x2="0" y2="1">
              {/* Mais claro em cima, a cor cheia embaixo: a luz vem de cima. */}
              <stop offset="0" style={{ stopColor: TOKEN[etapa], stopOpacity: 0.78 }} />
              <stop offset="1" style={{ stopColor: TOKEN[etapa], stopOpacity: 1 }} />
            </linearGradient>
          ))}
          <linearGradient id="funil-brilho" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.38" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <filter id="funil-sombra" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="black" floodOpacity="0.35" />
          </filter>
          <radialGradient id="funil-foco">
            <stop offset="0" style={{ stopColor: "var(--color-acento)", stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: "var(--color-acento)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* O alvo sob o bico: para onde o caminho aponta. Desenhado ANTES das
            bandas para ficar por baixo. */}
        <g aria-hidden transform={`translate(${cx} ${alturaBandas + 16})`}>
          <ellipse rx="150" ry="18" fill="url(#funil-foco)" />
          {[120, 84, 48].map((rx, i) => (
            <ellipse
              key={rx}
              rx={rx}
              ry={rx * 0.15}
              fill="none"
              className="stroke-linha-forte"
              strokeWidth={i === 2 ? 1.5 : 1}
              opacity={0.9 - i * 0.2}
            />
          ))}
          <circle r="3" className="fill-acento" />
        </g>

        {CAMINHO.map((etapa, i) => {
          const { d, brilho, y } = banda(i);
          const n = contagens[etapa] ?? 0;
          const vazia = n === 0;
          return (
            <Link
              key={etapa}
              href={`/corretor/leads?etapa=${etapa}`}
              className={`funil-banda group focus:outline-none ${vazia ? "opacity-45" : ""}`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <g filter="url(#funil-sombra)">
                <path d={d} fill={`url(#funil-${etapa})`} strokeLinejoin="round" />
                <path d={brilho} fill="url(#funil-brilho)" className="pointer-events-none" />
                <path
                  d={d}
                  fill="none"
                  stroke="white"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                  strokeLinejoin="round"
                  className="transition-opacity group-hover:stroke-opacity-50"
                />
              </g>
              <text
                x={cx}
                y={y + ALTURA_BANDA / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-sobre-cor font-display text-[15px] font-semibold"
              >
                <tspan>{ETAPA_LABEL[etapa]}</tspan>
                <tspan className="text-[13px] font-normal" dx="8">
                  {n}
                </tspan>
              </text>
            </Link>
          );
        })}
      </svg>

      {perdidos > 0 && (
        <p className="text-tenue mt-2 text-center text-xs">
          <Link href="/corretor/leads?etapa=perdido" className="hover:text-corpo underline-offset-4 hover:underline">
            {perdidos === 1 ? "1 contato perdido" : `${perdidos} contatos perdidos`} fora do funil
          </Link>
        </p>
      )}
    </div>
  );
}
