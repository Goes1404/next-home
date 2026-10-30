import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import {
  ANTECEDENCIA_MAXIMA_MIN,
  antecedenciaDoLembrete,
  deveLembrarVisita,
  notificacaoDoLembreteDeVisita,
  whatsappDoLembreteDeVisita,
} from "@/lib/notificacoes/regrasDeVisita";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { avisoPeloCentral } from "@/lib/central/avisos";

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
 * A antecedência que cada pessoa escolheu no perfil (0250). Sem a coluna
 * (migration não aplicada, 42703), todos ficam no padrão de 1 hora, calado;
 * outro erro avisa no log e também cai no padrão — o lembrete não deixa de
 * sair por causa de uma preferência.
 */
async function lerAntecedencias(supabase: Supa, corretores: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (corretores.length === 0) return mapa;
  const { data, error } = await supabase.from("corretores").select("id, antecedencia_visita_min").in("id", corretores);
  if (error) {
    if ((error as { code?: string }).code !== "42703") console.warn("[lembrete de visita] antecedência não lida:", error.message);
    return mapa;
  }
  for (const c of data ?? []) mapa.set(c.id, antecedenciaDoLembrete(c.antecedencia_visita_min));
  return mapa;
}

/**
 * Lembrete de visita antes da hora, no celular de quem FAZ a visita
 * (29/10/2026). A antecedência é a que a pessoa escolheu no perfil (0250;
 * padrão 1 hora, spec 4.7).
 *
 * Roda no tique dos follow-ups (pg_cron a cada 5 min): com o tique de 5 em
 * 5, o lembrete de 1 hora sai entre 55 e 60 min antes. A qualquer hora — a
 * hora é a que o próprio corretor marcou, e uma visita das 7h merece o
 * aviso das 6h. Com o número central ligado para a pessoa (onda 2), o
 * lembrete também vai pelo central (`avisoPeloCentral`); a notificação
 * continua igual.
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
    // A janela mais larga que alguém pode ter escolhido; cada visita é
    // conferida abaixo contra a antecedência de quem a faz.
    .lte("inicio", new Date(agora.getTime() + ANTECEDENCIA_MAXIMA_MIN * 60_000).toISOString())
    .order("inicio", { ascending: true })
    .limit(50);
  if (error) {
    console.warn("[lembrete de visita] falha ao ler (0236 aplicada?):", error.message);
    return 0;
  }

  const visitas = (data ?? []) as unknown as VisitaParaLembrar[];
  const antecedencias = await lerAntecedencias(supabase, [...new Set(visitas.map((v) => v.corretor_id))]);

  let lembradas = 0;
  for (const v of visitas) {
    if (!v.lead || v.lead.arquivado_em || v.lead.grupo_id !== v.grupo_id) continue;
    const antecedenciaMin = antecedencias.get(v.corretor_id);
    if (!deveLembrarVisita({ inicio: v.inicio, lembradoPara: v.lembrete_1h_para, agora, antecedenciaMin })) continue;

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
    const peloCentral = await avisoPeloCentral(
      supabase,
      v.corretor_id,
      whatsappDoLembreteDeVisita({ lead: v.lead, inicio: v.inicio, agora, linkDaFicha: linkDoPainel(v.grupo_id, `/corretor/leads/${v.lead_id}`) }),
      agora,
    );
    if (n > 0 || peloCentral) lembradas++;
  }
  return lembradas;
}
