import "server-only";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import type { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { formatarLembreteWhatsapp } from "@/lib/crm/lembretes";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";

type Supa = ReturnType<typeof createServiceClient>;

const POR_TIQUE = 10;

/**
 * Tarefas do lead vencidas → WhatsApp do próprio corretor (0178).
 *
 * Mesmo contrato dos lembretes das anotações: claim atômico
 * (`lembrete_enviado_em is null` no próprio UPDATE) antes de qualquer rede,
 * e falha de envio NÃO devolve o claim — o aviso não insiste a cada 5 min
 * num número que não está no ar; a tarefa segue na ficha e na fila do Início.
 *
 * Sai na hora que o corretor marcou, sem janela comercial: é ele quem
 * escolheu o horário, e a mensagem vai para o número dele, não para cliente.
 *
 * Antes da 0178 ser aplicada, a consulta falha pela coluna que não existe e
 * a função devolve 0 — nada quebra, só o aviso não sai.
 */
export async function processarLembretesDeTarefa(supabase: Supa, agora = new Date()): Promise<number> {
  const { data: vencidas, error } = await supabase
    .from("lead_tarefas")
    .select("id, corretor_id, lead_id, titulo")
    .is("lembrete_enviado_em", null)
    .is("concluida_em", null)
    .lte("prazo", agora.toISOString())
    .order("prazo", { ascending: true })
    .limit(POR_TIQUE);
  if (error) {
    console.warn("[lembrete de tarefa] consulta falhou:", error.message);
    return 0;
  }

  let enviados = 0;
  for (const tarefa of vencidas ?? []) {
    const { data: claim } = await supabase
      .from("lead_tarefas")
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq("id", tarefa.id)
      .is("lembrete_enviado_em", null)
      .select("id");
    if (!claim || claim.length === 0) continue;

    const { data: lead } = await supabase
      .from("leads")
      .select("nome, telefone, arquivado_em, grupo_id")
      .eq("id", tarefa.lead_id)
      .maybeSingle();
    // Lead arquivado: a tarefa ficou para trás junto com ele.
    if (!lead || lead.arquivado_em) {
      await supabase.from("lead_tarefas").update({ lembrete_erro: "lead_arquivado" }).eq("id", tarefa.id);
      continue;
    }

    const texto = formatarLembreteWhatsapp({
      texto: tarefa.titulo,
      leadNome: nomeParaExibir(lead),
      link: linkDoPainel(lead.grupo_id, `/corretor/leads/${tarefa.lead_id}`),
    });

    if (await avisarCorretor(supabase, tarefa.corretor_id, texto)) {
      enviados++;
    } else {
      // Sem número conectado ou envio recusado: a tarefa segue no painel.
      await supabase.from("lead_tarefas").update({ lembrete_erro: "nao_enviado" }).eq("id", tarefa.id);
    }
  }
  return enviados;
}
