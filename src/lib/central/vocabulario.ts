import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O vocabulário da transcrição do áudio no número central (30/10/2026).
 *
 * Na conversa da Bruna, "me manda a ficha do lead mais quente" virou
 * "limanja fica do líder mais quente", e "cria uma arte" virou "Frio Mart".
 * O modelo de transcrição aceita uma dica curta com os termos que podem
 * aparecer: o jargão do CRM e os nomes dos imóveis da imobiliária, que são
 * justamente as palavras que o modelo não conhece.
 */
export const JARGAO_DO_CRM = [
  "lead",
  "leads",
  "ficha",
  "CRM",
  "lista de transmissão",
  "funil",
  "visita",
  "corretor",
  "gestor",
  "arte",
  "post",
  "story",
  "reels",
  "Estúdio",
  "simulação",
  "financiamento",
];

/** Até quantos nomes de imóvel entram na dica. */
export const TETO_DE_IMOVEIS = 25;

export function montarVocabulario(nomesDeImoveis: string[]): string {
  const nomes = [...new Set(nomesDeImoveis.map((n) => n.trim()).filter(Boolean))].slice(0, TETO_DE_IMOVEIS);
  return [...JARGAO_DO_CRM, ...nomes].join(", ");
}

/** Os imóveis publicados da imobiliária. Falha na leitura: só o jargão. */
export async function vocabularioDoCentral(supabase: Supa, grupoId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("empreendimentos")
      .select("nome")
      .eq("grupo_id", grupoId)
      .eq("publicado", true)
      .order("nome")
      .limit(TETO_DE_IMOVEIS);
    return montarVocabulario((data ?? []).map((l) => l.nome));
  } catch {
    return montarVocabulario([]);
  }
}
