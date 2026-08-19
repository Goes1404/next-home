"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResultadoConversa = { erro?: string; ok?: string };

/**
 * Server Action é POST na rota, não navegação: o `proxy.ts` não cobre isto.
 */
async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return supabase;
}

/**
 * Devolve a palavra ao bot nesta conversa, agora.
 *
 * O webhook silencia a IA por 24 horas assim que o corretor responde do
 * celular (`pausarBotPorAtendimentoHumano`). A regra é boa — o bot não pode
 * falar por cima de um atendimento humano — mas até aqui não havia saída
 * nenhuma: sem tela e sem botão, a única forma de destravar era esperar o
 * dia passar ou dar UPDATE no banco. Foi por isso que, em produção, o bot
 * nunca respondeu uma única mensagem.
 *
 * Não passa pelo cliente qual conversa é de quem: a RLS da 0018 já recorta
 * (`corretor_id = corretor_atual()` ou gestor), então um id de outro
 * corretor simplesmente não atualiza linha nenhuma.
 */
export async function retomarBotNaConversa(conversaId: string): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: true, pausado_humano_ate: null })
    .eq("id", conversaId)
    .select("id");

  if (error) {
    console.error("[conversas] falha ao retomar bot:", error.message);
    return { erro: "Não foi possível reativar a IA agora." };
  }
  if (!data || data.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }

  revalidatePath("/corretor/conversas");
  return { ok: "IA reativada nesta conversa." };
}

/**
 * Silencia a IA nesta conversa por tempo indeterminado.
 *
 * Diferente da pausa automática de 24h, esta é uma decisão explícita: fica
 * em `bot_ativo = false` até o corretor reativar. É o caso do cliente que
 * pediu para falar só com gente, e do número que atende também a conversa
 * pessoal do corretor.
 */
export async function silenciarBotNaConversa(conversaId: string): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: false })
    .eq("id", conversaId)
    .select("id");

  if (error) {
    console.error("[conversas] falha ao silenciar bot:", error.message);
    return { erro: "Não foi possível desligar a IA agora." };
  }
  if (!data || data.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }

  revalidatePath("/corretor/conversas");
  return { ok: "IA desligada nesta conversa." };
}

export type MensagemConversa = {
  id: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  criadoEm: string;
};

/** Últimas mensagens, para o corretor conferir antes de devolver a palavra ao bot. */
export async function lerMensagens(conversaId: string): Promise<MensagemConversa[]> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .select("id, remetente, conteudo, created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[conversas] falha ao ler mensagens:", error.message);
    return [];
  }

  return (data ?? [])
    .map((m) => ({
      id: m.id,
      remetente: m.remetente as MensagemConversa["remetente"],
      conteudo: m.conteudo,
      criadoEm: m.created_at,
    }))
    .reverse();
}
