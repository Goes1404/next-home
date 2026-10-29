import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { segredoDaMedicao } from "@/lib/whatsapp/medicaoDoLink";
import { visitanteDaVitrine } from "@/lib/crm/vitrine";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Grava que o cliente abriu a vitrine (`empreendimentoId` nulo) ou a ficha
 * de um imóvel dela (29/10/2026, 0245). Quem chama acabou de validar o link
 * pelo token (`lerLinkPublico`, a rota `/selecao/<token>/ir/<slug>`) e passa
 * o lead e o corretor DELE; o grupo vem do carimbo pelo token.
 *
 * Sem dado do visitante: só o resumo diário (`visitanteDaVitrine`). A mesma
 * pessoa no mesmo dia conta uma vez por imóvel — a segunda linha bate no
 * índice único e é descartada calada. Nada aqui lança: quem chama está
 * servindo a página do cliente.
 */
export async function registrarVisualizacaoDaVitrine(
  supabase: Supa,
  v: { token: string; leadId: string; corretorId: string; empreendimentoId: string | null; headers: Headers },
): Promise<void> {
  try {
    const quem = visitanteDaVitrine(v.headers, segredoDaMedicao());
    if (!quem.conta) return;
    const { error } = await supabase.from("vitrine_visualizacoes").insert({
      token: v.token,
      lead_id: v.leadId,
      corretor_id: v.corretorId,
      empreendimento_id: v.empreendimentoId,
      visitante: quem.visitante,
      dia: quem.dia,
    });
    // 23505: a mesma pessoa já contou hoje. Esperado, não é falha.
    if (error && error.code !== "23505") console.warn("[vitrine] visualização não gravada:", error.message);
  } catch (erro) {
    console.warn("[vitrine] visualização não gravada:", erro);
  }
}
