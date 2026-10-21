"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

type Resultado = { erro?: string };

/**
 * "Pausar a IA" do Início (0205). Pausar guarda o modo escolhido e põe
 * `desativado`; retomar devolve o modo guardado (24/7 se não havia). Sempre
 * o número do PRÓPRIO corretor da sessão. Grava pela chave de serviço:
 * `modo_antes_da_pausa` não tem grant para a sessão.
 */
export async function pausarIa(pausar: boolean): Promise<Resultado> {
  const quem = await getCorretorLogado();
  if (!quem) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = createServiceClient();
  const { data: inst, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("modo_bot, modo_antes_da_pausa")
    .eq("corretor_id", quem.id)
    .maybeSingle();
  if (error) return { erro: "Não foi possível agora. Tente de novo." };
  if (!inst) return { erro: "Conecte seu WhatsApp primeiro." };

  const mudanca = pausar
    ? inst.modo_bot === "desativado"
      ? null
      : { modo_bot: "desativado" as const, modo_antes_da_pausa: inst.modo_bot }
    : { modo_bot: (inst.modo_antes_da_pausa ?? "24_7") as typeof inst.modo_bot, modo_antes_da_pausa: null };
  if (mudanca) {
    const { error: erroGravar } = await supabase
      .from("corretor_whatsapp_instancias")
      .update({ ...mudanca, updated_at: new Date().toISOString() })
      .eq("corretor_id", quem.id);
    if (erroGravar) return { erro: "Não foi possível agora. Tente de novo." };
  }
  revalidatePath("/corretor");
  revalidatePath("/corretor/whatsapp");
  return {};
}

/**
 * "Dividir leads do anúncio" do Início: liga ou desliga a roleta do próprio
 * número (0204). Ligar sem ninguém na lista não divide nada: devolve erro
 * para a tela levar à configuração.
 */
export async function alternarRoleta(ligar: boolean): Promise<Resultado> {
  const quem = await getCorretorLogado();
  if (!quem) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = createServiceClient();
  const { data: roleta, error } = await supabase
    .from("roleta_anuncios")
    .select("destinos")
    .eq("corretor_id", quem.id)
    .maybeSingle();
  if (error) return { erro: "Não foi possível agora. Tente de novo." };
  if (ligar && !roleta?.destinos?.length) return { erro: "sem_lista" };
  if (roleta) {
    const { error: erroGravar } = await supabase
      .from("roleta_anuncios")
      .update({ ligada: ligar, atualizado_em: new Date().toISOString(), atualizado_por: quem.id })
      .eq("corretor_id", quem.id);
    if (erroGravar) return { erro: "Não foi possível agora. Tente de novo." };
  }
  revalidatePath("/corretor");
  revalidatePath("/corretor/marketing/impulsionamentos");
  return {};
}
