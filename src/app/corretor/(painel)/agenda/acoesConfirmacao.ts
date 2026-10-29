"use server";

import { revalidatePath } from "next/cache";
import { pedirConfirmacaoDaVisita } from "@/lib/agenda/pedidoDeConfirmacao";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Pedir confirmação" da Agenda (0246, 29/10/2026): o toque do corretor
 * manda ao cliente o pedido de confirmação da visita, do número dele. Só a
 * visita que ELE faz, no grupo dele, e só se ele também for o dono do lead
 * (a conversa é do número do dono) — conferido em `pedirConfirmacaoDaVisita`
 * com o corretor e o grupo da SESSÃO.
 */
export async function pedirConfirmacaoDaAgenda(visitaId: string): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sua sessão expirou. Entre de novo." };

  const r = await pedirConfirmacaoDaVisita(createServiceClient(), {
    visitaId,
    grupoId: corretor.grupoId,
    quem: { por: "corretor", corretorId: corretor.id },
  });
  if (!r.enviado) return { erro: r.erro };
  revalidatePath("/corretor/agenda");
  return { ok: "Pedido enviado. Quando o cliente responder, a visita é atualizada e você é avisado." };
}
