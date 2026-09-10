"use server";

import { getPaginaDePessoas, type PessoaNaLista } from "@/lib/crm/pessoas";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import type { ConversaResumo } from "../conversas/Chat";

/**
 * A próxima página da lista.
 *
 * O filtro vindo do cliente não precisa ser confiável: quem recorta por
 * corretor é a RLS, no banco. O pior que uma busca forjada consegue é
 * devolver as pessoas do próprio corretor em outra ordem.
 */
export async function carregarMaisPessoas(busca: string, pagina: number): Promise<PessoaNaLista[]> {
  const { pessoas } = await getPaginaDePessoas({ busca: busca || undefined }, pagina);
  return pessoas;
}

/**
 * O resumo da conversa que a gaveta abre.
 *
 * A lista de Pessoas traz o `conversaId`, e só ele: o `Chat` precisa do
 * estado da IA (ativa, pausada, esperando liberação), que é o que decide o
 * selo do cabeçalho e o botão de assumir.
 *
 * O filtro por corretor é explícito pela mesma razão da 0031: a policy foi
 * aberta para o gestor, e sem ele o `maybeSingle()` passa a receber N linhas
 * justamente na tela dele.
 */
export async function carregarConversaDaPessoa(
  conversaId: string,
): Promise<ConversaResumo | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select(
      "id, telefone_cliente, nome_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, ultima_mensagem, ultima_interacao_em, lead_id, nao_lidas",
    )
    .eq("id", conversaId)
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    telefone: data.telefone_cliente,
    nome: data.nome_cliente,
    botAtivo: data.bot_ativo,
    liberada: data.liberado_por_palavra_chave,
    pausadoAte: data.pausado_humano_ate,
    ultimaMensagem: data.ultima_mensagem,
    ultimaInteracaoEm: data.ultima_interacao_em,
    temLead: Boolean(data.lead_id),
    naoLidas: data.nao_lidas,
  };
}
