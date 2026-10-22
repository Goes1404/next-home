import type { CustoDaIa as Custo } from "@/lib/planos/custoDaIa";

/**
 * O custo da IA do grupo no mês, a margem sobre a mensalidade e o alerta de
 * 30%. É ESTIMATIVA (tokens gravados × preço de tabela × câmbio): a tela diz
 * isso. Só número, nenhum texto de conversa.
 *
 * Classes por extenso: montada em tempo de execução, a classe não existiria.
 */
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const REAIS_COM_CENTAVOS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function CustoDaIa({ custo, mensalidade, cambio, compacto = false }: { custo: Custo; mensalidade: number | null; cambio: number; compacto?: boolean }) {
  const pct = custo.fracaoDaMensalidade === null ? null : Math.round(custo.fracaoDaMensalidade * 100);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-apoio text-fluid-xs">Custo da IA neste mês</p>
        {custo.alerta && (
          <span className="bg-alerta-lavado text-alerta border-alerta-linha text-fluid-xs rounded-full border px-2.5 py-1">
            Passou de 30% da mensalidade
          </span>
        )}
      </div>
      <p className="text-titulo text-fluid-sm">
        {REAIS.format(custo.custoBrl)}
        {custo.custoPorResposta !== null && <span className="text-apoio"> · {REAIS_COM_CENTAVOS.format(custo.custoPorResposta)} por resposta</span>}
      </p>
      {mensalidade !== null && mensalidade > 0 && custo.margem !== null ? (
        <p className={`text-fluid-sm ${custo.margem < 0 ? "text-perigo" : "text-titulo"}`}>
          Margem {REAIS.format(custo.margem)}
          <span className="text-apoio">
            {" "}
            · mensalidade {REAIS.format(mensalidade)}
            {pct !== null && ` · IA = ${pct}%`}
          </span>
        </p>
      ) : (
        <p className="text-fluid-xs text-apoio">Sem mensalidade: não há margem a calcular.</p>
      )}
      {!compacto && (
        <p className="text-fluid-xs text-tenue">
          Estimativa: tokens gravados × preço de tabela, dólar a {REAIS.format(cambio)}.
          {custo.modelosSemPreco.length > 0 && ` Sem preço na tabela (contado como gpt-4.1-mini): ${custo.modelosSemPreco.join(", ")}.`}
        </p>
      )}
    </div>
  );
}
