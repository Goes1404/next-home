import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsappParaGrupo } from "@/lib/whatsapp/provider";
import { origemLegivel } from "@/lib/notificacoes/leadNovo";

type Supa = ReturnType<typeof createServiceClient>;

type ItemDaFila = {
  id: string;
  lead_id: string;
  corretor_id: string;
  grupo_id: string;
  instance_name: string;
  grupo_jid: string;
  tentativas: number;
};

function umaLinha(valor: string | null | undefined, fallback = "—"): string {
  const limpo = (valor ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, 180) : fallback;
}

/** Texto curto para o grupo operacional; a ficha completa segue no CRM. */
export function textoDoLeadDistribuido(params: {
  corretor: string;
  nome: string | null;
  telefone: string | null;
  origem: string | null;
  anuncio: string | null;
  empreendimento: string | null;
}): string {
  const origem = origemLegivel(params.origem, params.anuncio);
  return [
    "📥 *Novo lead distribuído*",
    `*Corretor:* ${umaLinha(params.corretor)}`,
    `*Cliente:* ${umaLinha(params.nome, "Cliente novo")}`,
    `*WhatsApp:* ${umaLinha(params.telefone, "não informado")}`,
    ...(origem ? [`*Origem:* ${umaLinha(origem)}`] : []),
    ...(params.empreendimento ? [`*Imóvel:* ${umaLinha(params.empreendimento)}`] : []),
    "Abra o CRM para atender e registrar o contato.",
  ].join("\n");
}

type LeadDoAviso = { corretor_id: string | null; trazido_por: string; etapa: string };
type DonoAtual = { id: string; ativo: boolean; whatsapp_grupo_leads_jid: string | null };

export type DestinoDoAviso =
  | { acao: "enviar"; corretorId: string; grupoJid: string }
  | { acao: "cancelar"; motivo: string };

/**
 * Para onde o aviso vai de verdade, conferido na hora de mandar. A linha da
 * fila guarda o dono do instante em que foi enfileirada; a roleta pode ter
 * trocado a ficha de mão depois disso, e o corretor errado não pode receber
 * "novo lead" de um cliente que já não é dele. Pura de propósito: o worker só
 * lê os dados e aplica o veredito.
 */
export function destinoDoAviso(
  item: { corretor_id: string; grupo_jid: string },
  lead: LeadDoAviso | null,
  donoAtual: DonoAtual | null,
): DestinoDoAviso {
  void item; // o destino sai sempre do dono atual; a linha da fila só diz onde estava.
  if (!lead) return { acao: "cancelar", motivo: "Lead não encontrado." };
  // Impulsionamento do próprio corretor não é lead distribuído: ele já sabe.
  if (lead.trazido_por === "corretor") return { acao: "cancelar", motivo: "O cliente é do próprio corretor (anúncio dele)." };
  if (lead.etapa === "perdido" || lead.etapa === "fechado") return { acao: "cancelar", motivo: "O lead foi perdido ou fechado." };
  if (!lead.corretor_id || !donoAtual || donoAtual.id !== lead.corretor_id) {
    return { acao: "cancelar", motivo: "O lead está sem corretor responsável." };
  }
  if (!donoAtual.ativo) return { acao: "cancelar", motivo: "O corretor responsável não está mais ativo." };
  const grupoJid = donoAtual.whatsapp_grupo_leads_jid?.trim();
  if (!grupoJid) return { acao: "cancelar", motivo: "O lead mudou para quem não tem grupo." };
  return { acao: "enviar", corretorId: donoAtual.id, grupoJid };
}

/**
 * Consome a fila persistida de avisos dos grupos. A reserva é um update
 * condicional: dois crons podem ler a mesma linha, mas só um a transforma em
 * `enviando`. Antes de mandar, confere o dono atual da ficha (`destinoDoAviso`):
 * quem recebe é quem é dono agora, e aviso que perdeu o sentido vira
 * `cancelado`. Falha volta para a fila em cinco minutos; depois de três
 * tentativas ela fica em erro, visível ao gestor, sem reentregar o lead.
 */
export async function enviarLeadsDistribuidosParaGrupos(supabase: Supa, limite = 20): Promise<number> {
  const agora = new Date();
  const { data: candidatos, error } = await supabase
    .from("lead_envios_grupo")
    .select("id, lead_id, corretor_id, grupo_id, instance_name, grupo_jid, tentativas")
    .in("status", ["pendente", "erro"])
    .lte("proxima_tentativa_em", agora.toISOString())
    .lt("tentativas", 3)
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) {
    console.error("[grupos de leads] falha ao ler fila:", error.message);
    return 0;
  }

  let enviados = 0;
  for (const candidato of (candidatos ?? []) as ItemDaFila[]) {
    const { data: reservado, error: erroReserva } = await supabase
      .from("lead_envios_grupo")
      .update({
        status: "enviando",
        tentativas: candidato.tentativas + 1,
        updated_at: agora.toISOString(),
      })
      .eq("id", candidato.id)
      .in("status", ["pendente", "erro"])
      .lt("tentativas", 3)
      .select("id")
      .maybeSingle();
    if (erroReserva || !reservado) continue;

    const [{ data: lead }, { data: instancia }] = await Promise.all([
      supabase
        .from("leads")
        .select("nome, telefone, origem, anuncio_origem, empreendimento_id, corretor_id, trazido_por, etapa")
        .eq("id", candidato.lead_id)
        .eq("grupo_id", candidato.grupo_id)
        .maybeSingle(),
      supabase
        .from("corretor_whatsapp_instancias")
        .select("instance_name, status_conexao, conectado_em")
        .eq("grupo_id", candidato.grupo_id)
        .eq("instance_name", candidato.instance_name)
        .maybeSingle(),
    ]);

    // O dono é o de agora, não o da linha da fila: a roleta pode ter trocado.
    let dono: { id: string; nome: string; ativo: boolean; whatsapp_grupo_leads_jid: string | null; whatsapp_grupo_leads_nome: string | null } | null = null;
    if (lead?.corretor_id) {
      const { data } = await supabase
        .from("corretores")
        .select("id, nome, ativo, whatsapp_grupo_leads_jid, whatsapp_grupo_leads_nome")
        .eq("id", lead.corretor_id)
        .eq("grupo_id", candidato.grupo_id)
        .maybeSingle();
      dono = data ?? null;
    }

    const destino = destinoDoAviso(candidato, lead ?? null, dono);
    if (destino.acao === "cancelar") {
      await cancelarAviso(supabase, candidato, destino.motivo);
      continue;
    }
    // `enviar` só sai com lead e dono presentes; a guarda explícita é para o TypeScript.
    if (!lead || !dono) continue;

    if (!instancia || instancia.status_conexao !== "conectado" || !instancia.conectado_em) {
      await registrarFalha(supabase, candidato, "O número central está desconectado.", agora);
      continue;
    }

    let empreendimento: string | null = null;
    if (lead.empreendimento_id) {
      const { data } = await supabase
        .from("empreendimentos")
        .select("nome")
        .eq("id", lead.empreendimento_id)
        .eq("grupo_id", candidato.grupo_id)
        .maybeSingle();
      empreendimento = data?.nome ?? null;
    }

    const resultado = await enviarMensagemWhatsappParaGrupo({
      instanceName: candidato.instance_name,
      grupoJid: destino.grupoJid,
      texto: textoDoLeadDistribuido({
        corretor: dono.nome,
        nome: lead.nome,
        telefone: lead.telefone,
        origem: lead.origem,
        anuncio: lead.anuncio_origem,
        empreendimento,
      }),
    });
    if (!resultado.enviado) {
      await registrarFalha(supabase, candidato, resultado.detalhe ?? resultado.motivo ?? "O provedor recusou o envio.", agora);
      continue;
    }

    // A linha termina com o destino efetivo (quem recebeu, em que grupo): é o
    // que o gestor vê no histórico, e não o dono de quando foi enfileirada.
    const { error: erroFinal } = await supabase
      .from("lead_envios_grupo")
      .update({
        status: "enviado",
        corretor_id: destino.corretorId,
        grupo_jid: destino.grupoJid,
        grupo_nome: dono.whatsapp_grupo_leads_nome,
        provider_message_id: resultado.messageId ?? null,
        enviado_em: new Date().toISOString(),
        ultimo_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidato.id)
      .eq("status", "enviando");
    if (erroFinal) console.error("[grupos de leads] falha ao fechar envio:", erroFinal.message);
    else enviados++;
  }
  return enviados;
}

/** Aviso que perdeu o sentido: fecha como `cancelado`, com o porquê, sem nova tentativa. */
async function cancelarAviso(supabase: Supa, item: ItemDaFila, motivo: string): Promise<void> {
  const { error } = await supabase
    .from("lead_envios_grupo")
    .update({
      status: "cancelado",
      ultimo_erro: motivo.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("status", "enviando");
  if (error) console.error("[grupos de leads] falha ao cancelar aviso:", error.message);
}

async function registrarFalha(supabase: Supa, item: ItemDaFila, motivo: string, agora: Date): Promise<void> {
  const esgotou = item.tentativas + 1 >= 3;
  const { error } = await supabase
    .from("lead_envios_grupo")
    .update({
      status: "erro",
      ultimo_erro: motivo.slice(0, 1000),
      proxima_tentativa_em: new Date(agora.getTime() + 5 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
      ...(esgotou ? { proxima_tentativa_em: new Date("9999-12-31T00:00:00.000Z").toISOString() } : {}),
    })
    .eq("id", item.id)
    .eq("status", "enviando");
  if (error) console.error("[grupos de leads] falha ao registrar erro:", error.message);
}
