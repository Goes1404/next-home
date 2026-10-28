import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { dentroDoHorarioDeAviso } from "@/lib/crm/clienteSemResposta";
import { MENSAGEM_CONFLITO } from "./conflito";
import { formatarQuando } from "./comandos/textos";
import { gravarEstado, lerEstado } from "./conversaDeAgenda";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * "A visita aconteceu?" (0227, fase 4). Duas horas depois do horário, quem
 * FEZ a visita é cobrado no WhatsApp (e no Início do painel, que lê direto).
 * A resposta inteira é `responder_visita`, numa transação no banco.
 */

export type RespostaDaVisita = "aconteceu" | "faltou" | "remarcou";

/** Horas depois do horário para cobrar; e até quando (passou disso, só o painel). */
const COBRAR_DEPOIS_H = 2;
const COBRAR_ATE_H = 26;

export async function responderVisita(
  p: { visitaId: string; corretorId: string; resposta: RespostaDaVisita; nova?: Date | null },
  supabase: Supa = createServiceClient(),
): Promise<{ erro?: string; ok?: string }> {
  const { data, error } = await supabase.rpc("responder_visita", {
    p_visita: p.visitaId,
    p_corretor: p.corretorId,
    p_resposta: p.resposta,
    p_nova: p.nova ? p.nova.toISOString() : null,
  });
  if (error) {
    console.error("[agenda] resposta da visita não gravada:", error.message);
    return { erro: "Não foi possível registrar agora. Tente de novo." };
  }
  switch (data) {
    case "ok":
      return {
        ok:
          p.resposta === "aconteceu"
            ? "Anotado: a visita aconteceu."
            : p.resposta === "faltou"
              ? "Anotado: o cliente faltou."
              : `Anotado: visita remarcada para ${formatarQuando(p.nova!.toISOString())}.`,
      };
    case "data_invalida":
      return { erro: "A nova data precisa ser no futuro." };
    case "conflito":
      return { erro: MENSAGEM_CONFLITO };
    default:
      return { erro: "Essa visita já foi respondida ou não é mais sua." };
  }
}

export function textoDaCobranca(nome: string, inicio: string): string {
  return [
    `A visita com ${nome} (${formatarQuando(inicio)}) aconteceu?`,
    "1 · Aconteceu",
    "2 · Cliente faltou",
    "3 · Remarcou",
    "Responda só com o número. Também dá para responder no Início do painel.",
  ].join("\n");
}

type VisitaACobrar = {
  id: string;
  inicio: string;
  corretor_id: string;
  grupo_id: string;
  lead: { nome: string; arquivado_em: string | null } | null;
};

/**
 * O passo do tick de followups (a cada 5 min, pg_cron): marca as visitas
 * sem resposta há 24h e cobra as que passaram de 2h, dentro da janela de
 * avisos ao corretor (7h–21h59). Uma pergunta pendente por corretor: a
 * resposta "1" tem de saber a que visita se refere, então a próxima espera
 * a anterior ser respondida ou vencer. Reivindica antes de mandar (o tick
 * pode rodar duas vezes): `cobrada_em` só é gravado por quem o achou nulo.
 */
export async function cobrarVisitas(supabase: Supa = createServiceClient(), agora = new Date()): Promise<number> {
  const { error: erroVarredura } = await supabase.rpc("marcar_visitas_sem_confirmacao");
  if (erroVarredura) console.error("[agenda] varredura de sem confirmação:", erroVarredura.message);
  if (!dentroDoHorarioDeAviso(agora)) return 0;

  const { data, error } = await supabase
    .from("visitas")
    .select("id, inicio, corretor_id, grupo_id, lead:leads!visitas_lead_id_fkey(nome, arquivado_em)")
    .eq("status", "marcada")
    .is("cobrada_em", null)
    .lte("inicio", new Date(agora.getTime() - COBRAR_DEPOIS_H * 3_600_000).toISOString())
    .gte("inicio", new Date(agora.getTime() - COBRAR_ATE_H * 3_600_000).toISOString())
    .order("inicio", { ascending: true })
    .limit(20);
  if (error) throw new Error(`Falha ao ler as visitas a cobrar: ${error.message}`);

  const jaCobrados = new Set<string>();
  let cobradas = 0;
  for (const v of (data ?? []) as unknown as VisitaACobrar[]) {
    if (!v.lead || v.lead.arquivado_em || jaCobrados.has(v.corretor_id)) continue;
    if (await lerEstado(supabase, v.corretor_id, agora)) continue;
    const { data: reivindicada } = await supabase
      .from("visitas")
      .update({ cobrada_em: agora.toISOString() })
      .eq("id", v.id)
      .is("cobrada_em", null)
      .select("id");
    if (!reivindicada?.length) continue;
    jaCobrados.add(v.corretor_id);
    await gravarEstado(supabase, { corretorId: v.corretor_id, grupoId: v.grupo_id, estado: { tipo: "cobranca", visitaId: v.id, nome: v.lead.nome } }, agora);
    await avisarCorretor(supabase, v.corretor_id, textoDaCobranca(v.lead.nome, v.inicio), "/corretor");
    cobradas++;
  }
  return cobradas;
}
