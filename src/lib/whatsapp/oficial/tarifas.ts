/**
 * Quanto custa cada mensagem pela API oficial, no Brasil. Puro.
 *
 * Conferido em 03/11/2026:
 *   - utilidade e autenticação: US$ 0,0068 (≈ R$ 0,035), na página de preços
 *     da própria Meta;
 *   - marketing: US$ 0,0625 (≈ R$ 0,3217) por mensagem ENTREGUE. Esse número
 *     veio de revendedores (wabaindex, whautomate, zynfo); a tabela oficial
 *     em BRL não estava no texto da página. Por isso ele pode ser trocado sem
 *     commit: WHATSAPP_OFICIAL_TARIFA_MARKETING (em reais, ex. "0.3217").
 *   - resposta dentro da janela de 24 h ("serviço"): grátis até 1.000 por
 *     número por mês; desde 01/10/2026, cobrada depois disso. Sem valor
 *     conferido para o Brasil: entra como "serviço" na conta, sem preço.
 *
 * A estimativa serve para o corretor e o gestor saberem a ordem de grandeza
 * ANTES de confirmar uma lista. O valor real é o que a Meta cobra; o painel
 * do piloto conta pelo que o webhook diz que foi cobrado (`pricing`).
 */

export type CategoriaDeCobranca = "marketing" | "utility" | "authentication" | "service";

export const TARIFAS_CONFERIDAS_EM = "03/11/2026";

const PADRAO_REAIS: Record<CategoriaDeCobranca, number> = {
  marketing: 0.3217,
  utility: 0.035,
  authentication: 0.035,
  service: 0,
};

export function tarifaEmReais(categoria: CategoriaDeCobranca, ambiente: Record<string, string | undefined> = process.env): number {
  if (categoria === "marketing") {
    const doAmbiente = Number(String(ambiente.WHATSAPP_OFICIAL_TARIFA_MARKETING ?? "").replace(",", "."));
    if (Number.isFinite(doAmbiente) && doAmbiente > 0 && doAmbiente < 5) return doAmbiente;
  }
  return PADRAO_REAIS[categoria];
}

export function custoEstimado(
  quantidade: number,
  categoria: CategoriaDeCobranca = "marketing",
  ambiente?: Record<string, string | undefined>,
): number {
  return Math.max(0, quantidade) * tarifaEmReais(categoria, ambiente);
}

export function emReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A categoria que a Meta escreve no `pricing.category`, normalizada. */
export function categoriaDaMeta(valor: string | null | undefined): CategoriaDeCobranca | null {
  const v = (valor ?? "").toLowerCase();
  if (v === "marketing" || v === "marketing_lite") return "marketing";
  if (v === "utility") return "utility";
  if (v.startsWith("authentication")) return "authentication";
  if (v === "service") return "service";
  return null;
}
