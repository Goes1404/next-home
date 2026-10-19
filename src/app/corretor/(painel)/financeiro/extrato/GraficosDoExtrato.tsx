import { formatarReais } from "@/lib/financeiro/venda";
import type { FaixaDeEntrada, MesRecebido } from "@/lib/financeiro/graficosDoExtrato";
import { CartaoDeGrafico, GraficoVazio } from "../../_componentes/graficos/Moldura";
import { ColunasPorMes } from "../../_componentes/graficos/ColunasPorMes";

/**
 * Gráficos do Extrato (07/10/2026). Só desenho: as contas moram em
 * `graficosDoExtrato.ts`.
 *
 * - "Quanto entrou por mês?" — colunas da comissão recebida;
 * - "Quando entra o que falta?" — faixas por prazo, na ordem em que o
 *   dinheiro deve chegar;
 * - (gestor) "Quem deve mais?" — construtoras pela dívida, a mais velha em
 *   vermelho quando passa de 60 dias.
 */

const COR_FAIXA: Record<FaixaDeEntrada["tipo"], string> = {
  liberado: "bg-ok",
  atrasado: "bg-perigo",
  futuro: "bg-acento",
  sem_data: "bg-acento opacity-40",
};

export function RecebidoPorMes({ meses }: { meses: MesRecebido[] }) {
  const total = meses.reduce((s, m) => s + m.valor, 0);
  const comValor = meses.filter((m) => m.valor > 0).length;
  return (
    <CartaoDeGrafico
      titulo="Quanto entrou por mês?"
      subtitulo="Comissão recebida, últimos 6 meses"
      rodape={
        total > 0 ? (
          <>
            <strong className="text-titulo">{formatarReais(total)}</strong> no período · média de{" "}
            {formatarReais(Math.round(total / Math.max(1, comValor)))} nos meses com pagamento
          </>
        ) : undefined
      }
    >
      <ColunasPorMes
        meses={meses}
        vazio="As colunas aparecem quando a primeira comissão for paga."
        rotuloAcessivel="Comissão recebida por mês"
      />
    </CartaoDeGrafico>
  );
}

export function QuandoEntra({ faixas, gestor }: { faixas: FaixaDeEntrada[]; gestor: boolean }) {
  const total = faixas.reduce((s, f) => s + f.valor, 0);
  const maior = Math.max(...faixas.map((f) => f.valor), 0);
  return (
    <CartaoDeGrafico
      titulo="Quando entra o que falta?"
      subtitulo={gestor ? "Comissão da imobiliária ainda não paga, pela previsão" : "Sua comissão a receber, pela previsão de pagamento"}
      rodape={total > 0 ? <><strong className="text-titulo">{formatarReais(total)}</strong> a receber no total</> : undefined}
    >
      {faixas.length === 0 ? (
        <GraficoVazio texto="Nada a receber agora: toda comissão registrada já foi paga." />
      ) : (
        <ol className="space-y-3">
          {faixas.map((f) => (
            <li key={f.chave} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-fluid-sm min-w-0 truncate font-medium ${f.tipo === "atrasado" ? "text-perigo" : "text-titulo"}`}>
                  {f.rotulo}
                </span>
                <span className="text-fluid-sm text-titulo shrink-0 font-bold tabular-nums">{formatarReais(f.valor)}</span>
              </div>
              <div className="bg-vidro-forte h-2.5 w-full overflow-hidden rounded-full">
                <div className={`h-full rounded-full ${COR_FAIXA[f.tipo]}`} style={{ width: `${Math.max(3, (f.valor / maior) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </CartaoDeGrafico>
  );
}

export function QuemDeveMais({ construtoras }: { construtoras: { construtora: string; total: number; maisAntigaDias: number }[] }) {
  if (construtoras.length === 0) return null;
  const ordenadas = [...construtoras].sort((a, b) => b.total - a.total).slice(0, 6);
  const maior = ordenadas[0].total;
  return (
    <CartaoDeGrafico titulo="Quem deve mais à imobiliária?" subtitulo="Comissão pendente por construtora">
      <ol className="space-y-3">
        {ordenadas.map((c) => (
          <li key={c.construtora} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-fluid-sm text-titulo min-w-0 truncate font-medium">{c.construtora}</span>
              <span className="text-fluid-xs text-apoio shrink-0">
                <span className="text-titulo font-bold tabular-nums">{formatarReais(c.total)}</span>
                <span className={c.maisAntigaDias > 60 ? "text-perigo" : undefined}> · {c.maisAntigaDias} dias</span>
              </span>
            </div>
            <div className="bg-vidro-forte h-2.5 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${c.maisAntigaDias > 60 ? "bg-perigo" : "bg-acento"}`}
                style={{ width: `${Math.max(3, (c.total / maior) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </CartaoDeGrafico>
  );
}
