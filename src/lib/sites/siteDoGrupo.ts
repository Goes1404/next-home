import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { SITE_EM_BRANCO, type EnderecoEditavel, type SiteEditavel } from "./siteEditavel";

/**
 * Lê o que o grupo editou em "Meu site" (0209): as colunas `site_*`, a logo
 * (0208) e o CRECI. UMA linha, pelo id que quem chama já provou (a sessão do
 * gestor, a guarda da plataforma ou o grupo que o endereço resolveu). Pela
 * chave de serviço: as colunas novas não têm grant para a sessão.
 *
 * Grupo que não existe devolve nulo. Antes da 0209 ser aplicada as colunas
 * não existem (42703): aí vale o site em branco, e o site público segue como
 * estava. Qualquer outro erro LANÇA — a página sai 500 e o cache de rota
 * segue servindo a versão anterior, em vez de trocar o site de um cliente
 * pelo padrão por uma piscada do banco (a lição do porteiro, 19/10).
 */
export async function lerSiteDoGrupo(grupoId: string): Promise<SiteEditavel | null> {
  const servico = createServiceClient();
  const { data, error } = await comRetentativa("site do grupo", () =>
    servico
      .from("grupos")
      .select(
        "logo_url, creci, creci_tipo, site_cor, site_cor_secundaria, site_cor_fundo, site_cor_texto, site_capa_url, site_titulo, site_frase, site_sobre, site_whatsapp, site_email, site_endereco, site_instagram, site_facebook",
      )
      .eq("id", grupoId)
      .maybeSingle(),
  );
  if (error) {
    if (error.code === "42703") return { ...SITE_EM_BRANCO };
    throw new Error(`Falha ao ler o site do grupo ${grupoId}: ${error.message}`);
  }
  if (!data) return null;
  return {
    logoUrl: data.logo_url,
    cor: data.site_cor,
    corSecundaria: data.site_cor_secundaria,
    corFundo: data.site_cor_fundo,
    corTexto: data.site_cor_texto,
    capaUrl: data.site_capa_url,
    titulo: data.site_titulo,
    frase: data.site_frase,
    sobre: data.site_sobre,
    whatsapp: data.site_whatsapp,
    email: data.site_email,
    endereco: enderecoDoBanco(data.site_endereco),
    instagram: data.site_instagram,
    facebook: data.site_facebook,
    creci: data.creci,
    creciTipo: data.creci_tipo,
  };
}

/** O jsonb do banco → endereço; o que não tem o formato inteiro vale como ausente. */
function enderecoDoBanco(valor: unknown): EnderecoEditavel | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  const { logradouro, bairro, cidade, uf, cep } = v;
  if ([logradouro, bairro, cidade, uf, cep].every((c) => typeof c === "string" && c !== "")) {
    return { logradouro, bairro, cidade, uf, cep } as EnderecoEditavel;
  }
  return null;
}
