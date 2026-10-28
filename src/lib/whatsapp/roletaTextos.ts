/**
 * Textos da roleta dos anúncios (0204). Puro: a tela usa para a prévia e o
 * servidor para o envio — uma conta só.
 */

export const TEXTO_PASSAGEM_PADRAO = "Oi! Quem vai te atender é {corretor}, já te chama pelo número dele(a). 😊";

export const TEXTO_ABERTURA_PADRAO =
  "Oi, {cliente}! Aqui é {corretor}, da {imobiliaria}. Vi que você chamou pelo nosso anúncio sobre o {imovel}. Posso te ajudar?";

/**
 * Sugestão para a boas-vindas do modo grupo (0229). Não é padrão: em branco,
 * nada sai (a boas-vindas fixa foi tirada a pedido do dono em 27/10/2026).
 */
export const TEXTO_BOAS_VINDAS_SUGERIDO =
  "Oi, {cliente}! Recebemos seu contato pelo anúncio do {imovel}. {corretor}, da {imobiliaria}, vai te ligar em instantes.";

export const MARCADORES_DA_ROLETA = ["corretor", "cliente", "imovel", "imobiliaria"] as const;
export type VariaveisDaRoleta = Partial<Record<(typeof MARCADORES_DA_ROLETA)[number], string | null>>;

/**
 * Troca `{marcador}` pelo valor. Marcador sem valor some junto com o que
 * depende dele: ", {cliente}!" vira "!" e " sobre o {imovel}" sai inteiro —
 * mandar "Oi, !" ou "sobre o ." entrega que é mensagem pronta.
 */
export function preencherTexto(modelo: string, vars: VariaveisDaRoleta): string {
  let texto = modelo;
  for (const chave of MARCADORES_DA_ROLETA) {
    const valor = vars[chave]?.trim();
    if (valor) {
      texto = texto.split(`{${chave}}`).join(valor);
      continue;
    }
    texto = texto
      .replace(new RegExp(`,\\s*\\{${chave}\\}`, "g"), "")
      // " sobre o {imovel}", " do {imovel}", " a {cliente}"
      .replace(new RegExp(`\\s+(?:sobre|do|da|de|no|na|o|a)?\\s*(?:o|a)?\\s*\\{${chave}\\}`, "g"), "")
      .split(`{${chave}}`)
      .join("");
  }
  return texto.replace(/\s+([!?.,])/g, "$1").replace(/\s{2,}/g, " ").trim();
}
