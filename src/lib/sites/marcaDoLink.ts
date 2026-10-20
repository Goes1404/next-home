import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site as siteDaCasa } from "@/lib/site";
import type { Database } from "@/lib/supabase/types";
import { marcaDoGrupo, type MarcaDoSite } from "./marca";
import type { SiteDoGrupo } from "./resolver";

/**
 * A marca de uma página por token (espelho do parceiro, contador): a do
 * grupo DONO DO TOKEN, não a do endereço em que o link foi aberto (revisão
 * da fase 3, 20/10/2026).
 *
 * O painel ainda monta esses links com o endereço da Next Home (lacuna L45),
 * então o link do contador da Imobiliária B abre em `nexthomeimoveis.com`:
 * pela marca do endereço, ele leria "Contabilidade da Next Home" em cima dos
 * meses de B. E o link do parceiro da Next Home aberto no site de B mostraria
 * "Imóveis da Imobiliária B" com o estoque da Next Home.
 *
 * Recebe o cliente de quem chama (a página já validou o token e leu o grupo
 * por ele): lê só o nome e o endereço principal DO GRUPO DO TOKEN.
 */
export async function marcaDoGrupoDoLink(
  supabase: SupabaseClient<Database>,
  grupoDoToken: string,
  site: SiteDoGrupo,
): Promise<MarcaDoSite> {
  if (grupoDoToken === site.grupoId) return site.marca;
  if (grupoDoToken === GRUPO_NEXT_HOME_ID) {
    return marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: siteDaCasa.nome, url: siteDaCasa.url });
  }
  const [{ data: grupo }, { data: endereco }] = await Promise.all([
    supabase.from("grupos").select("nome").eq("id", grupoDoToken).maybeSingle(),
    supabase.from("enderecos_do_site").select("host").eq("grupo_id", grupoDoToken).eq("principal", true).maybeSingle(),
  ]);
  return marcaDoGrupo({
    grupoId: grupoDoToken,
    nome: grupo?.nome ?? "",
    url: endereco?.host ? `https://${endereco.host}` : "",
  });
}

/**
 * Para onde levar o link aberto no endereço de OUTRO grupo: o mesmo caminho
 * no endereço principal do grupo do token, para o cabeçalho e o rodapé do
 * site também serem dele. Nulo quando é o mesmo grupo, ou quando o grupo do
 * token não tem endereço próprio (aí a página abre aqui mesmo, com a marca
 * dele no corpo).
 */
export function enderecoCertoDoLink(marca: MarcaDoSite, site: SiteDoGrupo, caminho: string): string | null {
  if (marca.grupoId === site.grupoId || !marca.url) return null;
  return `${marca.url}${caminho}`;
}
