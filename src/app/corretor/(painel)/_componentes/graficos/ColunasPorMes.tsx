import { formatarReais } from "@/lib/financeiro/venda";
import { reaisCurto } from "@/lib/financeiro/painelDeVendas";
import { GraficoVazio } from "./Moldura";

/**
 * Colunas de valor por mês (07/10/2026), usadas em Vendas (VGV) e no
 * Extrato (comissão recebida). O último mês é o atual e vem em destaque; o
 * valor só fica escrito no mês atual e no maior, os outros aparecem no
 * hover e no título — número em toda coluna vira ruído. `marca` é uma
 * segunda linha opcional embaixo do mês (a posição no ranking, por exemplo).
 */
export function ColunasPorMes({
  meses,
  vazio,
  rotuloAcessivel,
}: {
  meses: { mes: string; rotulo: string; valor: number; detalhe?: string; marca?: string }[];
  vazio: string;
  rotuloAcessivel: string;
}) {
  const maior = Math.max(...meses.map((m) => m.valor), 0);
  if (maior === 0) return <GraficoVazio texto={vazio} />;
  const ultimo = meses.length - 1;
  return (
    <div>
      <ol className="flex h-44 items-end gap-2 sm:gap-3" aria-label={rotuloAcessivel}>
        {meses.map((m, i) => {
          const altura = m.valor > 0 ? Math.max(4, Math.round((m.valor / maior) * 100)) : 0;
          const atual = i === ultimo;
          const titulo = `${m.rotulo}: ${formatarReais(m.valor)}${m.detalhe ? ` ${m.detalhe}` : ""}`;
          return (
            <li key={m.mes} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={titulo}>
              <span
                className={`text-fluid-xs whitespace-nowrap ${atual || m.valor === maior ? "text-titulo font-bold" : "text-apoio opacity-0 group-hover:opacity-100"}`}
              >
                {m.valor > 0 ? reaisCurto(m.valor) : ""}
              </span>
              <span
                className={`w-full max-w-14 rounded-t transition-opacity group-hover:opacity-100 ${atual ? "bg-acento" : "bg-acento opacity-45"}`}
                style={{ height: `${altura}%` }}
              />
              <span className="sr-only">{titulo}</span>
            </li>
          );
        })}
      </ol>
      <ol className="border-linha mt-1 flex gap-2 border-t pt-1 sm:gap-3" aria-hidden>
        {meses.map((m, i) => (
          <li key={m.mes} className={`text-fluid-xs flex-1 text-center ${i === ultimo ? "text-titulo font-bold" : "text-tenue"}`}>
            {m.rotulo}
            {m.marca && <span className="text-fluid-xs text-apoio block font-bold">{m.marca}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
