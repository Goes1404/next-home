import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Anotação pessoal sem cliente pedida ao número central ("anota: ligar pro
 * cartório", onda 1, capacidade 21). É a nota do bloco de anotações (0100)
 * para o próprio autor, sem lead e sem lembrete: lembrete com hora é a
 * capacidade 8, de outra onda.
 *
 * O painel grava pelo cliente de sessão e a RLS recorta; o central não tem
 * sessão, então o recorte é explícito: autor = quem foi identificado, no
 * grupo dele, e só o autor apaga (o desfazer).
 */

type Supa = ReturnType<typeof createServiceClient>;

/** O mesmo teto do painel (`anotacoes/acoes.ts`). */
const TETO_DO_TEXTO = 4000;

export async function criarAnotacaoPessoal(
  p: { grupoId: string; corretorId: string; texto: string },
  supabase: Supa = createServiceClient(),
): Promise<{ id?: string; erro?: string }> {
  const texto = p.texto.trim().slice(0, TETO_DO_TEXTO);
  if (!texto) return { erro: "O que é para anotar?" };
  const { data, error } = await supabase
    .from("anotacoes")
    .insert({
      grupo_id: p.grupoId,
      corretor_id: p.corretorId,
      destinatario_id: p.corretorId,
      lead_id: null,
      texto,
      lembrete_em: null,
      lembrete_whatsapp: false,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não consegui anotar agora. Tente de novo." };
  return { id: data.id };
}

/** O desfazer: apaga a nota que o central criou, só do autor e do grupo dele. */
export async function apagarAnotacaoPessoal(
  p: { grupoId: string; corretorId: string; anotacaoId: string },
  supabase: Supa = createServiceClient(),
): Promise<{ erro?: string }> {
  const { data, error } = await supabase
    .from("anotacoes")
    .delete()
    .eq("id", p.anotacaoId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .select("id");
  if (error) return { erro: "Não consegui apagar a anotação agora. Tente de novo." };
  if (!data || data.length === 0) return { erro: "Essa anotação não existe mais." };
  return {};
}
