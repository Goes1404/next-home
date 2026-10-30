import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { caminhoDaVitrine, gerarCodigoDaVitrine } from "@/lib/crm/vitrine";
import { caminhoDoLink, mensagemParaCliente, type TipoDeLink } from "@/lib/crm/linksDoCliente";
import type { Database } from "@/lib/supabase/types";

/**
 * Grava um link do cliente (seleção, proposta, portal) e devolve o endereço e
 * a mensagem pronta (30/10/2026). Saiu de `linksAcoes.ts` para servir às duas
 * portas: os botões da ficha (sessão do painel, com RLS) e a seleção pedida
 * ao número central (chave de serviço, onda 3). O sorteio do código curto da
 * vitrine e a volta ao link longo sem a 0245 divergiriam no primeiro ajuste.
 *
 * NÃO confere quem pede: quem chama já provou que o lead é do corretor (a
 * sessão no painel; o dono e o grupo da identificação no central). O grupo
 * do link sai do carimbo pelo lead (0191).
 */

export type LinkGravado = { url: string; mensagem: string; token: string } | { erro: string };

export async function gravarLinkDoCliente(
  supabase: SupabaseClient<Database>,
  p: {
    tipo: TipoDeLink;
    leadId: string;
    corretorId: string;
    grupoId: string;
    dados: Record<string, unknown>;
    nome: string;
    expiraEm?: string;
    /** Vitrine (0245): o link sai curto, `/v/<codigo>`. */
    comCodigoCurto?: boolean;
  },
): Promise<LinkGravado> {
  const inserir = async (codigo: string | null) =>
    supabase
      .from("links_do_cliente")
      .insert({
        tipo: p.tipo,
        lead_id: p.leadId,
        corretor_id: p.corretorId,
        dados: p.dados as never,
        ...(p.expiraEm ? { expira_em: p.expiraEm } : {}),
        ...(codigo ? { codigo } : {}),
      })
      .select(codigo ? "token, codigo" : "token")
      .single()
      .then((r) => ({ ...r, data: r.data as { token: string; codigo?: string | null } | null }));

  /*
   * O código curto é sorteado aqui; colisão (23505) sorteia de novo. Sem a
   * 0245 aplicada a coluna não existe e o insert falha: o link sai no
   * formato longo de sempre, em vez de não sair.
   */
  let resultado = p.comCodigoCurto ? await inserir(gerarCodigoDaVitrine()) : await inserir(null);
  for (let tentativa = 0; p.comCodigoCurto && resultado.error?.code === "23505" && tentativa < 3; tentativa++) {
    resultado = await inserir(gerarCodigoDaVitrine());
  }
  if (p.comCodigoCurto && resultado.error) resultado = await inserir(null);
  const { data, error } = resultado;
  if (error || !data) return { erro: "Não foi possível criar o link agora." };
  const caminho = data.codigo ? caminhoDaVitrine(data.codigo) : caminhoDoLink(p.tipo, data.token);
  const url = `${await lerEnderecoDoCliente(p.grupoId)}${caminho}`;
  const primeiroNome = p.nome.trim().split(/\s+/)[0] || null;
  return { url, mensagem: mensagemParaCliente({ tipo: p.tipo, primeiroNome, url }), token: data.token };
}
