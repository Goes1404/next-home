import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import {
  CARENCIA_CLIENTE_RESPONDEU_MIN,
  carenciaDoClienteRespondeuVencida,
  notificacaoDoClienteRespondeu,
} from "@/lib/notificacoes/regrasDoClienteRespondeu";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * "Cliente respondeu" no celular do corretor dono (29/10/2026).
 *
 * Chamada pelo webhook do WhatsApp, depois da resposta (`after`), quando a
 * IA calou e a conversa está com o corretor (`deveAvisarClienteRespondeu`).
 *
 * Só o DONO do lead recebe, e só se o dono é o dono do número por onde a
 * mensagem chegou, no mesmo grupo: lead repassado a outro corretor tem o
 * aviso no grupo dele, e um número nunca avisa corretor de outra casa.
 *
 * Contra o spam, duas camadas: a carência de 15 min por lead
 * (`aviso_cliente_respondeu_em`, claim atômico gravado ANTES do envio — as
 * mensagens de uma rajada chegam em invocações paralelas) e a `tag` por
 * lead, que faz a próxima substituir a anterior na bandeja em vez de
 * empilhar. Sem a coluna (0236 não aplicada) o claim falha e nada sai.
 * Nunca lança.
 */
export async function avisarClienteRespondeu(
  supabase: Supa,
  p: {
    leadId: string;
    conversaId: string;
    corretorIdDoNumero: string;
    grupoIdDoNumero: string;
    texto: string | null;
    tipo: string | null;
  },
  agora = new Date(),
): Promise<boolean> {
  try {
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, nome, telefone, corretor_id, grupo_id, arquivado_em, aviso_cliente_respondeu_em")
      .eq("id", p.leadId)
      .maybeSingle();
    if (error || !lead) return false;
    if (lead.arquivado_em || lead.corretor_id !== p.corretorIdDoNumero || lead.grupo_id !== p.grupoIdDoNumero) return false;
    // Atalho: dentro da carência nem tenta o claim (que é quem decide de fato).
    if (!carenciaDoClienteRespondeuVencida(lead.aviso_cliente_respondeu_em, agora)) return false;

    const limite = new Date(agora.getTime() - CARENCIA_CLIENTE_RESPONDEU_MIN * 60_000).toISOString();
    const { data: claim, error: erroClaim } = await supabase
      .from("leads")
      .update({ aviso_cliente_respondeu_em: agora.toISOString() })
      .eq("id", lead.id)
      .eq("corretor_id", p.corretorIdDoNumero)
      .or(`aviso_cliente_respondeu_em.is.null,aviso_cliente_respondeu_em.lt.${limite}`)
      .select("id");
    if (erroClaim) {
      console.warn("[cliente respondeu] claim falhou (0236 aplicada?):", erroClaim.message);
      return false;
    }
    if (!claim?.length) return false;

    const n = await notificarCorretor(supabase, p.corretorIdDoNumero, {
      ...notificacaoDoClienteRespondeu({ lead, texto: p.texto, tipo: p.tipo }),
      url: `/corretor/conversas?c=${p.conversaId}`,
      tag: `cliente-respondeu-${lead.id}`,
    });
    return n > 0;
  } catch (err) {
    console.warn("[cliente respondeu] falhou:", err);
    return false;
  }
}
