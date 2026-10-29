import { temModulo, ehRamo } from "@/lib/ramos/ramos";

/**
 * Recursos que só fazem sentido para quem vende IMÓVEL (29/10/2026).
 *
 * A captação direta dos portais (ZAP, Viva Real, OLX), o match de imóveis ×
 * leads e a vitrine personalizada são de imobiliária. Com a 0244 o grupo tem
 * `ramo`; estes recursos seguem o módulo `catalogoDeImoveis` do ramo.
 *
 * Toda tela, menu e rotina destes recursos pergunta AQUI. Sem ramo conhecido
 * (rotina que ainda não leu a coluna), vale como imobiliária — o padrão da
 * coluna.
 */
export function recursosDeImoveis(ramo?: string | null): boolean {
  if (!ramo) return true;
  return ehRamo(ramo) ? temModulo(ramo, "catalogoDeImoveis") : true;
}
