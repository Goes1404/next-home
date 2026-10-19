import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O número para onde vai o visitante que chegou pelo LINK PESSOAL de um
 * corretor (cookie de 30 dias).
 *
 * Até 07/10/2026 o link pessoal era só preferência no sorteio (0130): com o
 * número do corretor desconectado, ou ele em pausa, o clique caía no sorteio
 * e ia para OUTRO corretor — quem divulgou o próprio link perdia o cliente.
 * Agora o link pessoal nunca sai do corretor: número conectado na
 * plataforma primeiro (é por ele que a IA atende e o lead nasce no CRM) e,
 * sem ele, o WhatsApp do perfil.
 */
export async function numeroDoLinkPessoal(
  supabase: SupabaseClient,
  corretor: { id: string; whatsapp: string | null | undefined },
): Promise<string | null> {
  const { data } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("telefone_conectado, status_conexao")
    .eq("corretor_id", corretor.id)
    .maybeSingle<{ telefone_conectado: string | null; status_conexao: string | null }>();

  const conectado = data?.status_conexao === "conectado" ? data.telefone_conectado : null;
  const numero = (conectado ?? corretor.whatsapp ?? "").replace(/\D/g, "");
  return numero.length >= 10 ? numero : null;
}
