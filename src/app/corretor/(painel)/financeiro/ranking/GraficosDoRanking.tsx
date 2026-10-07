import { formatarReais } from "@/lib/financeiro/venda";
import { reaisCurto } from "@/lib/financeiro/painelDeVendas";
import type { FatiaDoCorretor, LinhaDoRankingGrafico, MesDaEvolucao } from "@/lib/financeiro/graficosDoRanking";
import { ordemDoPodio } from "@/lib/financeiro/graficosDoRanking";
import { Anel } from "../../_componentes/graficos/Anel";
import { CartaoDeGrafico } from "../../_componentes/graficos/Moldura";
import { ColunasPorMes } from "../../_componentes/graficos/ColunasPorMes";

/**
 * Gráficos do Ranking (07/10/2026). Só desenho; as contas moram em
 * `graficosDoRanking.ts` e só usam o que o ranking já mostra a todos.
 */

const MEDALHA = ["🥇", "🥈", "🥉"];

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Avatar({ linha, tamanho }: { linha: LinhaDoRankingGrafico; tamanho: string }) {
  return linha.fotoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={linha.fotoUrl} alt="" className={`${tamanho} shrink-0 rounded-full object-cover`} />
  ) : (
    <span aria-hidden className={`${tamanho} bg-acento-lavado text-titulo text-fluid-sm flex shrink-0 items-center justify-center rounded-full font-bold`}>
      {iniciais(linha.nome)}
    </span>
  );
}

export function Podio({ lideres, eu }: { lideres: LinhaDoRankingGrafico[]; eu: string }) {
  const podio = ordemDoPodio(lideres);
  if (podio.length === 0) return null;
  const maior = Math.max(...podio.map((p) => p.linha.vgv));
  return (
    <CartaoDeGrafico titulo="Quem está no pódio?" subtitulo="Os três maiores VGVs do período">
      <ol className="flex items-end justify-center gap-2 sm:gap-4">
        {podio.map(({ linha, posicao }) => {
          const altura = Math.max(30, Math.round((linha.vgv / maior) * 100));
          const souEu = linha.corretorId === eu;
          return (
            <li key={linha.corretorId} className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:max-w-44" aria-label={`${posicao}º lugar: ${linha.nome}, ${formatarReais(linha.vgv)}`}>
              <Avatar linha={linha} tamanho={posicao === 1 ? "size-14" : "size-11"} />
              <span className="text-fluid-xs text-titulo w-full truncate text-center font-medium">
                {linha.nome.split(" ")[0]}
                {souEu ? " (você)" : ""}
              </span>
              <span className="text-fluid-xs text-apoio">{reaisCurto(linha.vgv)}</span>
              <span
                className={`flex w-full items-start justify-center rounded-t-xl pt-2 text-2xl ${posicao === 1 ? "bg-acento" : souEu ? "bg-acento opacity-70" : "bg-acento-lavado"}`}
                style={{ height: `${Math.round(altura * 1.1)}px` }}
              >
                <span aria-hidden>{MEDALHA[posicao - 1]}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </CartaoDeGrafico>
  );
}

export function SuaFatia({ fatia }: { fatia: FatiaDoCorretor }) {
  if (fatia.porcentagem === null) return null;
  return (
    <CartaoDeGrafico titulo="Qual a sua fatia do VGV da equipe?" subtitulo={`A equipe vendeu ${formatarReais(fatia.total)} no período`}>
      <div className="flex items-center gap-4">
        <Anel valor={fatia.porcentagem} tamanho={88} rotulo="Sua fatia do VGV da equipe" />
        <div className="min-w-0 space-y-2">
          <p className="text-fluid-sm text-corpo">
            Seu VGV: <strong className="text-titulo">{formatarReais(fatia.meu)}</strong>
            {fatia.posicao ? ` · ${fatia.posicao}º lugar` : ""}
          </p>
          {fatia.acima ? (
            <p className="text-fluid-sm text-corpo">
              Faltam <strong className="text-titulo">{formatarReais(fatia.acima.falta)}</strong> para passar {fatia.acima.nome.split(" ")[0]}.
            </p>
          ) : (
            <p className="text-fluid-sm text-ok font-medium">Você lidera o período.</p>
          )}
          {fatia.abaixo && (
            <p className="text-fluid-xs text-apoio">
              {fatia.abaixo.nome.split(" ")[0]} vem logo atrás, a {formatarReais(fatia.abaixo.vantagem)}.
            </p>
          )}
        </div>
      </div>
    </CartaoDeGrafico>
  );
}

export function Evolucao({ meses }: { meses: MesDaEvolucao[] }) {
  return (
    <CartaoDeGrafico titulo="Como você foi mês a mês?" subtitulo="Seu VGV e sua posição nos últimos 6 meses">
      <ColunasPorMes
        meses={meses.map((m) => ({
          mes: m.mes,
          rotulo: m.rotulo,
          valor: m.valor,
          detalhe: m.posicao ? `· ${m.posicao}º de ${m.participantes}` : "· sem venda",
          marca: m.posicao ? `${m.posicao}º` : "—",
        }))}
        vazio="Suas colunas aparecem com a primeira venda."
        rotuloAcessivel="Seu VGV por mês"
      />
    </CartaoDeGrafico>
  );
}
