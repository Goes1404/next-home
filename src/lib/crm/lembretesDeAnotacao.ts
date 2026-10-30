import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { formatarLembreteWhatsapp } from "@/lib/crm/lembretes";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { avisoPeloCentral } from "@/lib/central/avisos";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Lembretes das anotações vencidos → WhatsApp do próprio corretor (0100).
 * Saiu de `api/cron/followups/route.ts` (30/10/2026) para ter teste: a rota
 * só pode exportar os métodos HTTP.
 *
 * Roda no MESMO tique dos follow-ups, antes da janela comercial (14/10): o
 * pg_cron já bate lá a cada 5 min, e criar um segundo cron para meia dúzia
 * de lembretes seria configuração nova em produção sem ganho nenhum. Fica
 * fora da trava dos follow-ups porque o claim abaixo já impede envio duplo.
 *
 * O claim é atômico (`lembrete_enviado_em is null` no próprio UPDATE):
 * entre dois tiques concorrentes, só um manda. Falha de envio carimba
 * `lembrete_erro` e NÃO devolve o claim — lembrete é aviso, não campanha:
 * insistir num número quebrado a cada 5 min viraria spam de erro, e o
 * painel continua mostrando o lembrete até o corretor concluir.
 *
 * Com o número central ligado para o destinatário (onda 2, spec 4.7), o
 * lembrete sai pelo central (`avisoPeloCentral`), na mesma hora e com o mesmo
 * claim; inclusive o pedido ao central ("me lembra amanhã às 10h", Frente I),
 * que é esta mesma anotação. Central fora ou desligado: o caminho de sempre.
 */
const LEMBRETES_POR_TIQUE = 10;

export async function processarLembretesDeAnotacao(supabase: Supa, agora: Date = new Date()): Promise<void> {
  const { data: vencidos } = await supabase
    .from("anotacoes")
    .select("id, destinatario_id, corretor_id, texto, lead_id")
    .eq("lembrete_whatsapp", true)
    .is("lembrete_enviado_em", null)
    .is("concluida_em", null)
    .not("lembrete_em", "is", null)
    .lte("lembrete_em", agora.toISOString())
    .order("lembrete_em", { ascending: true })
    .limit(LEMBRETES_POR_TIQUE);

  for (const nota of vencidos ?? []) {
    // Claim atômico antes de qualquer rede.
    const { data: claim } = await supabase
      .from("anotacoes")
      .update({ lembrete_enviado_em: agora.toISOString() })
      .eq("id", nota.id)
      .is("lembrete_enviado_em", null)
      .select("id");
    if (!claim || claim.length === 0) continue;

    const [{ data: instancia }, { data: destinatario }, { data: autor }, { data: lead }] =
      await Promise.all([
        supabase
          .from("corretor_whatsapp_instancias")
          .select("instance_name, status_conexao")
          .eq("corretor_id", nota.destinatario_id)
          .maybeSingle(),
        supabase.from("corretores").select("whatsapp, grupo_id").eq("id", nota.destinatario_id).maybeSingle(),
        nota.corretor_id !== nota.destinatario_id
          ? supabase.from("corretores").select("nome").eq("id", nota.corretor_id).maybeSingle()
          : Promise.resolve({ data: null }),
        nota.lead_id
          ? supabase.from("leads").select("nome").eq("id", nota.lead_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const texto = formatarLembreteWhatsapp({
      texto: nota.texto,
      leadNome: lead?.nome ?? null,
      autorNome: autor?.nome ?? null,
      link: nota.lead_id && destinatario ? linkDoPainel(destinatario.grupo_id, `/corretor/leads/${nota.lead_id}`) : null,
    });

    if (await avisoPeloCentral(supabase, nota.destinatario_id, texto, agora)) continue;

    if (!instancia || instancia.status_conexao !== "conectado" || !destinatario?.whatsapp) {
      // Sem canal: o lembrete segue vivo no painel; só o WhatsApp não sai.
      await supabase.from("anotacoes").update({ lembrete_erro: "sem_whatsapp" }).eq("id", nota.id);
      continue;
    }

    const envio = await enviarMensagemWhatsapp({
      instanceName: instancia.instance_name,
      telefone: destinatario.whatsapp,
      texto,
    });

    if (!envio.enviado) {
      await supabase
        .from("anotacoes")
        .update({ lembrete_erro: `erro_envio:${envio.motivo ?? "desconhecido"}` })
        .eq("id", nota.id);
    }
  }
}
