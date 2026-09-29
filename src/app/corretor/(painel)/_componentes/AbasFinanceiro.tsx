import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * As telas do Financeiro (26/09/2026): vendas, extrato e meta, ranking de
 * VGV e desempenho. A lista vem de `subitensDe`, como toda barra do painel:
 * escrita à mão, ela divergiria do menu (o defeito de 04/09).
 */
export function AbasFinanceiro({ ativa }: { ativa: string }) {
  const abas = subitensDe("/corretor/financeiro").map((sub) => ({ href: sub.href, label: sub.label }));
  return <AbasSecao abas={abas} ativa={ativa} rotulo="Seções do financeiro" />;
}
