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
