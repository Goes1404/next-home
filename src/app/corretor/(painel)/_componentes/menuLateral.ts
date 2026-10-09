/**
 * Menu lateral do computador aberto ou recolhido (09/10/2026, pedido do
 * usuário: "um botão para minimizar o nav bar nos desktops").
 *
 * Guardado em cookie, como o modo do funil, para o servidor desenhar a
 * lateral já do jeito escolhido. Guardado só no navegador, a lateral nasceria
 * aberta e fecharia na frente de quem a prefere recolhida, a cada recarga.
 *
 * Módulo sem dependência nenhuma: o layout (servidor) lê a constante e a
 * lateral (cliente) grava. Constante importada por componente de cliente
 * arrasta o módulo inteiro (a lição do `limitesPdf.ts`).
 */
export const COOKIE_MENU_LATERAL = "nh-menu-lateral";

export function lerMenuRecolhido(valor: string | undefined): boolean {
  return valor === "recolhido";
}

/** Grava a escolha no navegador (um ano, só no painel). */
export function gravarMenuRecolhido(recolhido: boolean): void {
  document.cookie = `${COOKIE_MENU_LATERAL}=${recolhido ? "recolhido" : "aberto"}; path=/corretor; max-age=31536000; samesite=lax`;
}
