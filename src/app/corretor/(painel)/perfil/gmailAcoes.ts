"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Desconecta o Gmail: apaga o refresh token. Revogar no Google também é
 * possível (myaccount.google.com/permissions), e a tela diz isso.
 */
export async function desconectarGmail(): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const { error } = await createServiceClient().from("contas_email_google").delete().eq("corretor_id", corretor.id);
  if (error) return { erro: "Não consegui desconectar agora." };
  revalidatePath("/corretor/perfil");
  return { ok: "Gmail desconectado." };
}
