import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { inicioDoDiaEmSP } from "@/lib/notificacoes/relogio";
import {
  DIAS_DA_JANELA,
  HORAS_SEM_CONTATO,
  escolherLeadsParados,
  horaDeVarrerLeadsParados,
  notificacaoDoLeadParado,
} from "@/lib/notificacoes/regrasDoLeadParado";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * "Lead parado sem contato" no celular do corretor dono (29/10/2026). As
 * réguas (48h, janela de 7 dias, 3 por corretor por dia, 8h–20h) estão em
 * `regrasDoLeadParado.ts`; a busca é `leads_parados_para_aviso` (0236).
 *
 * Uma vez por lead por dia: o claim `aviso_parado_em` só é gravado se ainda
 * não é de hoje (São Paulo), ANTES do envio, e com o dono conferido no
 * próprio UPDATE — lead que trocou de dono entre a busca e o claim não
 * avisa o antigo. Sem a função (0236 não aplicada) nada sai. Nunca lança.
 */
export async function avisarLeadsParados(supabase: Supa, agora = new Date()): Promise<number> {
  if (!horaDeVarrerLeadsParados(agora)) return 0;
  try {
    const diaInicio = inicioDoDiaEmSP(agora).toISOString();
    const { data: candidatos, error } = await supabase.rpc("leads_parados_para_aviso", {
      p_parado_desde: new Date(agora.getTime() - HORAS_SEM_CONTATO * 3_600_000).toISOString(),
      p_janela_desde: new Date(agora.getTime() - DIAS_DA_JANELA * 86_400_000).toISOString(),
      p_dia_inicio: diaInicio,
      p_limite: 200,
    });
    if (error) {
      console.warn("[lead parado] busca falhou (0236 aplicada?):", error.message);
      return 0;
    }
    if (!candidatos?.length) return 0;

    // Quantos avisos de lead parado cada corretor já recebeu hoje.
    const corretores = [...new Set(candidatos.map((c) => c.corretor_id))];
    const { data: deHoje } = await supabase
      .from("leads")
      .select("corretor_id")
      .in("corretor_id", corretores)
      .gte("aviso_parado_em", diaInicio);
    const jaAvisados = new Map<string, number>();
    for (const l of deHoje ?? []) {
      if (l.corretor_id) jaAvisados.set(l.corretor_id, (jaAvisados.get(l.corretor_id) ?? 0) + 1);
    }

    let avisados = 0;
    for (const lead of escolherLeadsParados(candidatos, jaAvisados)) {
      const { data: claim } = await supabase
        .from("leads")
        .update({ aviso_parado_em: agora.toISOString() })
        .eq("id", lead.id)
        .eq("corretor_id", lead.corretor_id)
        .eq("grupo_id", lead.grupo_id)
        .or(`aviso_parado_em.is.null,aviso_parado_em.lt.${diaInicio}`)
        .select("id");
      if (!claim?.length) continue;
      const n = await notificarCorretor(supabase, lead.corretor_id, {
        ...notificacaoDoLeadParado({ lead, ultimoContato: lead.ultimo_contato, agora }),
        url: `/corretor/leads/${lead.id}`,
        tag: `lead-parado-${lead.id}`,
      });
      if (n > 0) avisados++;
    }
    return avisados;
  } catch (err) {
    console.warn("[lead parado] falhou:", err);
    return 0;
  }
}
