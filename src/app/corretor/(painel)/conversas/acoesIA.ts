"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gerarEEnviarPelaIA } from "@/lib/whatsapp/aberturaPelaIA";
import { separarRajada } from "@/lib/whatsapp/rajada";
import { historicoRecente } from "@/lib/whatsapp/repositorio";

/**
 * O botão de IA do painel: "IA assume agora" (conversa) →
 * `assumirConversaComIA`.
 *
 * O "Iniciar conversa com IA" da ficha do lead saiu em 03/10/2026 (plano de
 * ativação, regra N1): a IA só responde. O primeiro contato é do corretor,
 * por lista de transmissão, e a ficha leva para lá.
 */

export type ResultadoIA = { erro?: string; ok?: string; respondeu?: boolean; conversaId?: string };

async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return supabase;
}

/**
 * O botão "IA assume agora" da conversa.
 *
 * Liga as TRÊS condições de `botDeveResponder` de uma vez e, se a última
 * fala é do cliente (pendência sem resposta), a IA responde NA HORA —
 * assumir e ficar em silêncio até a próxima mensagem parecia botão
 * quebrado.
 */
export async function assumirConversaComIA(conversaId: string): Promise<ResultadoIA> {
  const supabase = await exigirSessao();

  // A escrita via cliente de SESSÃO é a autorização: a RLS da 0018 recorta
  // a carteira — conversa de outro corretor não atualiza linha nenhuma.
  const { data: liberada, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: true, pausado_humano_ate: null, liberado_por_palavra_chave: true })
    .eq("id", conversaId)
    .select("id, telefone_cliente, lead_id, e_teste, corretor_id");
  if (error || !liberada || liberada.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }
  const conversa = liberada[0];

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, status_conexao, nome_assistente, tom_voz, conectado_em")
    .eq("corretor_id", conversa.corretor_id)
    .maybeSingle();

  if (!instancia || instancia.status_conexao !== "conectado") {
    // Sem número no ar dá para assumir (as flags já estão gravadas), só não
    // dá para responder já — dizer isso é melhor que fingir que respondeu.
    revalidatePath("/corretor/conversas");
    return { ok: "IA assumiu a conversa. Conecte o número para ela responder." };
  }

  const pendencia = separarRajada(await historicoRecente(conversaId)).pendentes.length > 0;
  if (!pendencia) {
    revalidatePath("/corretor/conversas");
    return { ok: "IA assumiu — responde na próxima mensagem do cliente." };
  }

  const resultado = await gerarEEnviarPelaIA({
    conversa: {
      id: conversa.id,
      telefoneCliente: conversa.telefone_cliente,
      leadId: conversa.lead_id,
      eTeste: conversa.e_teste ?? false,
    },
    instancia,
    instrucaoAbertura: "",
  });

  revalidatePath("/corretor/conversas");
  if (resultado.erro) return { ok: "IA assumiu a conversa.", erro: resultado.erro };
  return { ok: "IA assumiu e já respondeu o cliente.", respondeu: true };
}
