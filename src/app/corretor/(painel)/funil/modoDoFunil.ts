/**
 * Funil completo (10 etapas) ou resumido (6 grupos), escolhido no botão da
 * tela do Funil (0165). Guardado em cookie para o servidor desenhar já no
 * modo certo. É só jeito de olhar: o banco guarda sempre a etapa completa.
 */
export const COOKIE_MODO_DO_FUNIL = "nh-funil-modo";

export type ModoDoFunil = "completo" | "resumido";

export function lerModoDoFunil(valor: string | undefined): ModoDoFunil {
  return valor === "resumido" ? "resumido" : "completo";
}

/** Grava a escolha no navegador (um ano, só no painel). */
export function gravarModoDoFunil(modo: ModoDoFunil): void {
  document.cookie = `${COOKIE_MODO_DO_FUNIL}=${modo}; path=/corretor; max-age=31536000; samesite=lax`;
}
