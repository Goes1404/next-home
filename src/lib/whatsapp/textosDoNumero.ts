import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { nomesDaPessoa } from "./campaignQueue";
import { DIAS_DE_COMPARACAO, TEXTOS_DE_COMPARACAO, type TextoAnterior } from "./variacaoDeTexto";

/**
 * As mensagens de lista que o número do corretor mandou nos últimos 30 dias,
 * mais as já conferidas que esperam a vez de sair, da mais recente para a mais
 * antiga (até 300). É contra elas que cada mensagem nova é conferida
 * (`variarSemRepetir`).
 *
 * As que esperam entram porque a conferência acontece antes da cota: uma
 * mensagem pode ficar pronta e só sair amanhã, e a próxima não pode ser
 * parecida com ela.
 *
 * Devolve null quando a leitura falha. Quem chama não manda nada: sem saber o
 * que o número já mandou, não dá para garantir que a próxima não repete.
 */
export async function textosRecentesDoNumero(
  supabase: SupabaseClient<Database>,
  corretorId: string,
  agora: Date = new Date(),
): Promise<TextoAnterior[] | null> {
  const desde = new Date(agora.getTime() - DIAS_DE_COMPARACAO * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id, mensagem_personalizada, enviado_em, lead:leads(nome), campanha:whatsapp_campanhas!inner(corretor_id)")
    .eq("campanha.corretor_id", corretorId)
    .or(`enviado_em.gte.${desde},and(status.eq.pendente,or(personalizado_por_ia.is.true,semelhanca_max.not.is.null))`)
    .order("enviado_em", { ascending: false, nullsFirst: true })
    .limit(TEXTOS_DE_COMPARACAO);
  if (error || !data) {
    if (error) console.warn("[campanha] não consegui ler as mensagens recentes do número:", error.message);
    return null;
  }
  return data
    .filter((linha) => linha.mensagem_personalizada?.trim())
    .map((linha) => {
      const lead = (Array.isArray(linha.lead) ? linha.lead[0] : linha.lead) as { nome: string | null } | null;
      return { id: linha.id, texto: linha.mensagem_personalizada, nomes: nomesDaPessoa(lead?.nome) };
    });
}
