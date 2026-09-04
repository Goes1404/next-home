import Link from "next/link";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

/**
 * O funil desenhado como FUNIL — faixas que estreitam, uma por etapa.
 *
 * Referência do usuário (04/09/2026): o funil de vendas clássico, em bandas
 * coloridas, do topo largo ("gerar leads") ao bico ("fechar"). Aqui as bandas
 * são as etapas REAIS do processo — novo → contatei → visita → documentação →
 * fechado — e a cor de cada uma é a MESMA que o quadro, a lista e a ficha já
 * usam (`--color-etapa-*`). Inventar a paleta da referência quebraria a
 * leitura que o resto do painel ensinou: cor de etapa é vocabulário.
 *
 * ## A geometria é de funil, não de gráfico
 *
 * A largura de cada banda é FIXA (decresce em passos iguais), não proporcional
 * à contagem. Proporcional viraria gráfico de barras deitado: com 46 em
 * "contatei" e 1 em "visita", a banda de visita sumiria e o desenho deixaria
 * de ser um funil. O número vai escrito dentro; a forma diz "isto é um
 * caminho", o número diz quantos estão em cada passo.
 *
 * "Perdido" fica FORA do funil, como nota embaixo: não é um passo do caminho,
 * é a saída dele (mesma decisão de `ETAPAS_CAMINHO`).
 *
 * Cada banda é um link para a lista já filtrada (`?etapa=`) — o parâmetro que
 * a lista LÊ, conferido; link de painel com parâmetro que a lista não entende
 * já mordeu este projeto (`linksDeFiltro.test.ts`).
 */

const CAMINHO: EtapaFunil[] = ["novo", "primeiro_contato", "visita_agendada", "documentacao", "fechado"];

/** `fill-*` por etapa, escrito por extenso: classe montada em runtime não existe. */
const PREENCHIMENTO: Record<EtapaFunil, string> = {
  novo: "fill-etapa-novo",
  primeiro_contato: "fill-etapa-contato",
  visita_agendada: "fill-etapa-visita",
  documentacao: "fill-etapa-doc",
  fechado: "fill-etapa-fechado",
  perdido: "fill-etapa-perdido",
};

// Caixa do desenho: 400 de largura. Cada banda tem 44 de altura e um vão de 6.
const LARGURA = 400;
const ALTURA_BANDA = 44;
const VAO = 6;
/** Meia-largura do topo de cada banda, do mais largo ao bico. */
const MEIAS = [196, 160, 124, 88, 52];

function banda(i: number): { d: string; y: number; cx: number } {
  const y = i * (ALTURA_BANDA + VAO);
  const topo = MEIAS[i];
  const base = MEIAS[i + 1] ?? MEIAS[i] - 30;
  const cx = LARGURA / 2;
  // Trapézio com cantos levemente arredondados via traço largo (stroke-linejoin).
  return {
    d: `M ${cx - topo} ${y} L ${cx + topo} ${y} L ${cx + base} ${y + ALTURA_BANDA} L ${cx - base} ${y + ALTURA_BANDA} Z`,
    y,
    cx,
  };
}

export function FunilVisual({ contagens }: { contagens: Record<EtapaFunil, number> }) {
  const alturaTotal = CAMINHO.length * (ALTURA_BANDA + VAO) - VAO;
  const perdidos = contagens.perdido ?? 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${LARGURA} ${alturaTotal}`}
        role="img"
        aria-label={`Funil: ${CAMINHO.map((e) => `${ETAPA_LABEL[e]} ${contagens[e] ?? 0}`).join(", ")}`}
        className="mx-auto block w-full max-w-md"
      >
        {CAMINHO.map((etapa, i) => {
          const { d, y, cx } = banda(i);
          const n = contagens[etapa] ?? 0;
          const vazia = n === 0;
          return (
            <Link key={etapa} href={`/corretor/leads?etapa=${etapa}`} className="group focus:outline-none">
              <path
                d={d}
                className={`${PREENCHIMENTO[etapa]} transition-opacity group-hover:opacity-90 group-focus-visible:opacity-80 ${vazia ? "opacity-35" : ""}`}
                stroke="rgb(255 255 255 / 0.18)"
                strokeWidth="1"
                strokeLinejoin="round"
              />
              {/* Rótulo e número dentro da banda. `fill-sobre-cor` porque a
                  banda é sólida na cor da etapa — o mesmo par que os botões
                  de avanço usam. Banda vazia fica apagada, e o texto junto. */}
              <text
                x={cx}
                y={y + ALTURA_BANDA / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`fill-sobre-cor font-display text-[15px] font-semibold ${vazia ? "opacity-70" : ""}`}
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

      {/* A saída do caminho, fora do desenho. Só aparece quando há alguém lá:
          "0 perdidos" é ruído com aparência de dado. */}
      {perdidos > 0 && (
        <p className="text-tenue mt-3 text-center text-xs">
          <Link href="/corretor/leads?etapa=perdido" className="hover:text-corpo underline-offset-4 hover:underline">
            {perdidos === 1 ? "1 contato perdido" : `${perdidos} contatos perdidos`} fora do funil
          </Link>
        </p>
      )}
    </div>
  );
}
