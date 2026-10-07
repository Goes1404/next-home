import { CartaoDeGrafico } from "@/app/corretor/(painel)/_componentes/graficos/Moldura";
import {
  ROTULO_CANAL_DO_GRAFICO,
  type CanalDoGrafico,
  type LinhaPorCanal,
  type SemanaDeClientes,
} from "@/lib/crm/impulsionamentosCalculo";

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 100 ? 2 : 0 });

/**
 * "Onde vai o dinheiro, de onde vêm os clientes?" (07/10/2026). Para cada
 * canal, duas barras na mesma régua: a parte do gasto (cinza, o que sai) e a
 * parte dos clientes (na cor do módulo, o que volta). Canal em que a barra de
 * clientes é maior que a do gasto rende acima da média; o contrário, abaixo.
 * O número escrito ao lado de cada barra garante que a leitura não dependa da
 * cor.
 */
export function GastoEClientesPorCanal({ linhas }: { linhas: LinhaPorCanal[] }) {
  if (linhas.length < 2) return null;
  const custoMedio = (() => {
    const gasto = linhas.reduce((s, l) => s + l.gasto, 0);
    const clientes = linhas.reduce((s, l) => s + l.clientes, 0);
    return clientes > 0 ? gasto / clientes : null;
  })();

  return (
    <CartaoDeGrafico
      titulo="Onde vai o dinheiro, de onde vêm os clientes?"
      subtitulo="Por canal: a parte do investimento e a parte dos clientes que ele trouxe."
      rodape={`Só as campanhas com valor informado.${custoMedio !== null ? ` Custo médio por cliente: ${reais(custoMedio)}.` : ""}`}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-fluid-xs text-corpo" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-corpo/45" /> Investimento
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-acento" /> Clientes
        </span>
      </div>
      <ul className="space-y-4">
        {linhas.map((l) => {
          const rende = l.parteDosClientes - l.parteDoGasto;
          return (
            <li key={l.canal} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-fluid-sm font-semibold text-titulo">{l.rotulo}</span>
                <span className="text-fluid-xs text-corpo tabular-nums">
                  {l.custoPorCliente === null ? "nenhum cliente ainda" : `${reais(l.custoPorCliente)} por cliente`}
                  {rende >= 10 && <span className="ml-1.5 font-semibold text-ok">rende acima da média</span>}
                  {rende <= -10 && <span className="ml-1.5 font-semibold text-alerta">rende abaixo da média</span>}
                </span>
              </div>
              <Barra
                parte={l.parteDoGasto}
                cor="bg-corpo/45"
                texto={`${l.parteDoGasto}% · ${reais(l.gasto)}`}
                rotulo={`Investimento em ${l.rotulo}`}
              />
              <Barra
                parte={l.parteDosClientes}
                cor="bg-acento"
                texto={`${l.parteDosClientes}% · ${l.clientes} ${l.clientes === 1 ? "cliente" : "clientes"}`}
                rotulo={`Clientes de ${l.rotulo}`}
              />
            </li>
          );
        })}
      </ul>
    </CartaoDeGrafico>
  );
}

function Barra({ parte, cor, texto, rotulo }: { parte: number; cor: string; texto: string; rotulo: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3" title={`${rotulo}: ${texto}`}>
      <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-vidro-forte">
        <span className={`block h-full rounded-full ${cor}`} style={{ width: `${Math.max(parte, parte > 0 ? 2 : 0)}%` }} />
      </span>
      <span className="text-fluid-xs min-w-[8.5rem] text-right font-semibold text-titulo tabular-nums">
        <span className="sr-only">{rotulo}: </span>
        {texto}
      </span>
    </div>
  );
}

const diaCurto = (dia: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`));

/**
 * "Quantos clientes as campanhas trazem por semana?" (07/10/2026). Uma
 * coluna por semana, terminando hoje; o detalhe por canal fica no título da
 * coluna e na leitura de tela. Uma cor só: o que se lê aqui é o ritmo, e o
 * canal já tem o gráfico de cima.
 */
export function ClientesPorSemana({ semanas }: { semanas: SemanaDeClientes[] }) {
  const maior = Math.max(0, ...semanas.map((s) => s.total));
  if (maior === 0) return null;
  const total = semanas.reduce((s, x) => s + x.total, 0);
  const ultima = semanas.length - 1;
  const detalhe = (s: SemanaDeClientes) =>
    (Object.entries(s.porCanal) as [CanalDoGrafico, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${ROTULO_CANAL_DO_GRAFICO[c]} ${n}`)
      .join(", ");

  return (
    <CartaoDeGrafico
      titulo="Quantos clientes as campanhas trazem por semana?"
      subtitulo={`Últimas ${semanas.length} semanas: ${total} ${total === 1 ? "cliente" : "clientes"}. A última coluna é a semana que termina hoje.`}
    >
      <ol className="flex h-40 items-end gap-1.5 sm:gap-3" aria-label="Clientes por semana">
        {semanas.map((s, i) => {
          const altura = s.total > 0 ? Math.max(6, Math.round((s.total / maior) * 100)) : 0;
          const texto = `Semana até ${diaCurto(s.fim)}: ${s.total} ${s.total === 1 ? "cliente" : "clientes"}${s.total > 0 ? ` (${detalhe(s)})` : ""}`;
          return (
            <li key={s.fim} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={texto}>
              <span className={`text-fluid-xs tabular-nums ${i === ultima || s.total === maior ? "font-bold text-titulo" : "text-apoio"}`}>
                {s.total > 0 ? s.total : ""}
              </span>
              <span
                aria-hidden
                className={`w-full max-w-12 rounded-t ${i === ultima ? "bg-acento" : "bg-acento opacity-50"}`}
                style={{ height: `${altura}%` }}
              />
              <span className="sr-only">{texto}</span>
            </li>
          );
        })}
      </ol>
      <ol className="mt-1 flex gap-1.5 border-t border-linha pt-1 sm:gap-3" aria-hidden>
        {semanas.map((s, i) => (
          <li key={s.fim} className={`text-fluid-xs flex-1 text-center ${i === ultima ? "font-bold text-titulo" : "text-tenue"}`}>
            {diaCurto(s.fim)}
          </li>
        ))}
      </ol>
    </CartaoDeGrafico>
  );
}
