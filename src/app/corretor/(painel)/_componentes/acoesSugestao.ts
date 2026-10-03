"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemDoPainel } from "../conversas/acoes";

/**
 * As sugestões de mensagem da fila do Início (0147, plano de ativação, regra
 * N7): pós-visita e pedido de indicação deixaram de sair sozinhos. O runner
 * gera o texto; o corretor envia daqui, como se tivesse digitado no Live
 * Chat (mesmo caminho, mesma gravação, mesma pausa da IA).
 *
 * A leitura com a SESSÃO é a autorização: a policy da 0147 só mostra o
 * follow-up de conversa do corretor logado. A escrita do status vai pela
 * chave de serviço, porque a tabela não dá UPDATE a ninguém pelo painel.
 */

type Resultado = { erro?: string; ok?: string };

async function sugestaoDoCorretor(followupId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_followups")
    .select("id, conversa_id, texto_sugerido, status")
    .eq("id", followupId)
    .maybeSingle();
  return data;
}

export async function enviarSugestao(followupId: string): Promise<Resultado> {
  const sugestao = await sugestaoDoCorretor(followupId);
  if (!sugestao || sugestao.status !== "sugerido" || !sugestao.texto_sugerido) {
    return { erro: "Essa sugestão não está mais disponível." };
  }

  const envio = await enviarMensagemDoPainel(sugestao.conversa_id, sugestao.texto_sugerido);
  if (envio.erro) return { erro: envio.erro };

  const { error } = await createServiceClient()
    .from("whatsapp_followups")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("id", followupId)
    .eq("status", "sugerido");
  if (error) console.error("[sugestão] enviada, mas o status não foi gravado:", error.message);

  revalidatePath("/corretor");
  return { ok: "Mensagem enviada." };
}

export async function dispensarSugestao(followupId: string): Promise<Resultado> {
  const sugestao = await sugestaoDoCorretor(followupId);
  if (!sugestao || sugestao.status !== "sugerido") return { erro: "Essa sugestão não está mais disponível." };

  const { error } = await createServiceClient()
    .from("whatsapp_followups")
    .update({ status: "descartado", motivo: "corretor_dispensou" })
    .eq("id", followupId)
    .eq("status", "sugerido");
  if (error) return { erro: "Não foi possível dispensar agora." };

  revalidatePath("/corretor");
  return { ok: "Sugestão dispensada." };
}
