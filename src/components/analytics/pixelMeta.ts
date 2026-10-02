/**
 * Regras puras do Pixel da Meta (02/10/2026). Ficam fora do componente para
 * terem teste sem navegador.
 */

/**
 * Páginas em que o pixel NÃO roda. As de token levam a credencial do cliente
 * no endereço (`/portal/<token>`), e todo evento do pixel manda o endereço da
 * página para a Meta. O painel e o atalho `/wa` também ficam de fora: o painel
 * é área interna, e `/wa` é só um redirecionamento.
 */
const FORA_DO_PIXEL = [
  "/corretor",
  "/wa",
  "/portal",
  "/selecao",
  "/proposta",
  "/documentos",
  "/parceiro",
];

export function paginaRastreavel(caminho: string): boolean {
  return !FORA_DO_PIXEL.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/** Slug do imóvel quando a página é a ficha dele, para o ViewContent. */
export function imovelDaPagina(caminho: string): string | null {
  const m = /^\/empreendimentos\/([^/?#]+)\/?$/.exec(caminho);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * O clique é num botão de WhatsApp? Vale o atalho `/wa` (todo botão do site
 * passa por ele) e o link direto `wa.me`/`api.whatsapp.com` (a página do
 * corretor). Devolve o slug do imóvel quando o atalho o traz, para o Lead
 * dizer de qual imóvel veio.
 */
export function cliqueDeWhatsapp(
  href: string,
  origem: string,
): { imovel: string | null } | null {
  let url: URL;
  try {
    url = new URL(href, origem);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === "wa.me" || host === "api.whatsapp.com" || host === "web.whatsapp.com") {
    return { imovel: null };
  }
  if (url.origin !== new URL(origem).origin) return null;
  if (url.pathname === "/wa" || url.pathname === "/wa/") return { imovel: null };
  const m = /^\/wa\/([^/?#]+)\/?$/.exec(url.pathname);
  return m ? { imovel: decodeURIComponent(m[1]) } : null;
}

/** O ID do pixel é só dígitos; qualquer outra coisa desliga o pixel. */
export function idDoPixelValido(id: string | undefined): string | null {
  const limpo = (id ?? "").trim();
  return /^\d{6,20}$/.test(limpo) ? limpo : null;
}
