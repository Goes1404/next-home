"use server";

import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { notificarAdminsDaPlataforma } from "@/lib/notificacoes/push";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O teste dos avisos da plataforma (29/10/2026). Vai para os aparelhos de
 * TODOS os administradores (é o mesmo canal dos atendimentos de verdade):
 * se o outro ADM também recebeu, o canal está de pé para os dois.
 */
export async function enviarAvisoDeTesteDaPlataforma(): Promise<{ ok?: string; erro?: string }> {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return { erro: admin.erro };
  const n = await notificarAdminsDaPlataforma(createServiceClient(), {
    titulo: "Avisos da Astro ligados",
    corpo: "Pedidos de contratação, suporte e contas novas, suspensas ou atrasadas chegam aqui.",
    url: "/plataforma",
    tag: "teste-da-plataforma",
  });
  return n > 0
    ? { ok: `Enviado para ${n} ${n === 1 ? "aparelho" : "aparelhos"} de administradores.` }
    : { erro: "Nenhum aparelho recebeu. Ligue os avisos neste celular primeiro." };
}
