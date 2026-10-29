import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import {
  ANTECEDENCIA_DO_LEMBRETE_MIN,
  deveLembrarVisita,
  notificacaoDoLembreteDeVisita,
} from "@/lib/notificacoes/regrasDeVisita";

type Supa = ReturnType<typeof createServiceClient>;

type VisitaParaLembrar = {
  id: string;
  lead_id: string;
  corretor_id: string;
  grupo_id: string;
  inicio: string;
  lembrete_1h_para: string | null;
  lead: { nome: string | null; telefone: string | null; arquivado_em: string | null; grupo_id: string } | null;
};

/**
 * Lembrete de visita 1h antes, no celular de quem FAZ a visita (29/10/2026).
 *
 * Roda no tique dos follow-ups (pg_cron a cada 5 min): com o tique de 5 em
 * 5, o lembrete sai entre 55 e 60 min antes. A qualquer hora — a hora é a
 * que o próprio corretor marcou, e uma visita das 7h merece o aviso das 6h.
 *
 * O claim é `lembrete_1h_para` = o `inicio` lembrado, gravado ANTES do envio
 * e só se o valor ainda for o lido: dois tiques ao mesmo tempo não lembram
 * duas vezes, e visita remarcada (mesma linha, `inicio` novo, 0224) ganha
 * lembrete novo. Sem a coluna (0236 não aplicada) a leitura falha e nada sai.
 *
 * Quem recebe é `visitas.corretor_id`: hoje sempre o dono do lead; o gatilho
 * de grupo da 0224 garante que é do mesmo grupo do lead.
 */
export async function lembrarVisitasDaProximaHora(supabase: Supa, agora = new Date()): Promise<number> {
  const { data, error } = await supabase
    .from("visitas")
    .select(
      "id, lead_id, corretor_id, grupo_id, inicio, lembrete_1h_para, lead:leads!visitas_lead_id_fkey(nome, telefone, arquivado_em, grupo_id)",
    )
    .eq("status", "marcada")
    .gt("inicio", agora.toISOString())
    .lte("inicio", new Date(agora.getTime() + ANTECEDENCIA_DO_LEMBRETE_MIN * 60_000).toISOString())
    .order("inicio", { ascending: true })
    .limit(50);
  if (error) {
    console.warn("[lembrete de visita] falha ao ler (0236 aplicada?):", error.message);
    return 0;
  }

  let lembradas = 0;
  for (const v of (data ?? []) as unknown as VisitaParaLembrar[]) {
    if (!v.lead || v.lead.arquivado_em || v.lead.grupo_id !== v.grupo_id) continue;
    if (!deveLembrarVisita({ inicio: v.inicio, lembradoPara: v.lembrete_1h_para, agora })) continue;

    let claim = supabase
      .from("visitas")
      .update({ lembrete_1h_para: v.inicio })
      .eq("id", v.id)
      .eq("inicio", v.inicio)
      .eq("status", "marcada");
    claim = v.lembrete_1h_para === null ? claim.is("lembrete_1h_para", null) : claim.eq("lembrete_1h_para", v.lembrete_1h_para);
    const { data: reivindicada } = await claim.select("id");
    if (!reivindicada?.length) continue;

    const n = await notificarCorretor(supabase, v.corretor_id, {
      ...notificacaoDoLembreteDeVisita({ lead: v.lead, inicio: v.inicio, agora }),
      url: `/corretor/leads/${v.lead_id}`,
      tag: `visita-${v.id}`,
    });
    if (n > 0) lembradas++;
  }
  return lembradas;
}
