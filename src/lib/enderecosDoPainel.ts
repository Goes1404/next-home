/**
 * Endereços que servem SÓ o CRM (21/10/2026): o painel do corretor, a área
 * da plataforma e as rotas técnicas abrem neles; página do site público é
 * mandada para o painel. É o endereço que as imobiliárias clientes usam até
 * existir o domínio da plataforma, para não entrarem pelo site da Next Home.
 * `ENDERECOS_DO_PAINEL` (separados por vírgula) acrescenta outros.
 */
const PADRAO = ["astroimob.vercel.app"];

export function ehEnderecoSoDoPainel(host: string | null | undefined, extra = process.env.ENDERECOS_DO_PAINEL): boolean {
  const h = (host ?? "").toLowerCase().split(":")[0].replace(/\.$/, "");
  if (!h) return false;
  const lista = [...PADRAO, ...(extra ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)];
  return lista.includes(h);
}

/**
 * As páginas de TOKEN que o cliente recebe do corretor (21/10/2026): seleção
 * de imóveis, documentos, proposta, portal, contador e parceiro
 * (`caminhoDoLink` e `acoes` do contador e do parceiro). Elas abrem nos
 * endereços só do painel porque o grupo que ainda não tem site próprio manda
 * o link no endereço do painel (`enderecoDoCliente`). O resto das páginas do
 * site continua indo para o painel. A conferência do token é da própria
 * página (`lerLinkPublico`).
 */
export const ROTAS_DE_TOKEN_DO_CLIENTE = ["/selecao", "/documentos", "/proposta", "/portal", "/contador", "/parceiro"] as const;

export function ehRotaDeTokenDoCliente(pathname: string): boolean {
  return ROTAS_DE_TOKEN_DO_CLIENTE.some((raiz) => pathname.startsWith(`${raiz}/`) && pathname.length > raiz.length + 1);
}
