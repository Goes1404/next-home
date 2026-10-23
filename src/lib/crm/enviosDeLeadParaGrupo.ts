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

/**
 * Consome a fila persistida de avisos dos grupos. A reserva Ã© um update
 * condicional: dois crons podem ler a mesma linha, mas sÃ³ um a transforma em
 * `enviando`. Falha volta para a fila em cinco minutos; depois de trÃªs
 * tentativas ela fica em erro, visÃ­vel ao gestor, sem reentregar o lead.
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

    const [{ data: lead }, { data: corretor }, { data: instancia }] = await Promise.all([
      supabase
        .from("leads")
        .select("nome, telefone, origem, anuncio_origem, empreendimento_id")
        .eq("id", candidato.lead_id)
        .eq("grupo_id", candidato.grupo_id)
        .maybeSingle(),
      supabase.from("corretores").select("nome, ativo").eq("id", candidato.corretor_id).eq("grupo_id", candidato.grupo_id).maybeSingle(),
      supabase
        .from("corretor_whatsapp_instancias")
        .select("instance_name, status_conexao, conectado_em")
        .eq("grupo_id", candidato.grupo_id)
        .eq("instance_name", candidato.instance_name)
        .maybeSingle(),
    ]);

    let empreendimento: string | null = null;
    if (lead?.empreendimento_id) {
      const { data } = await supabase
        .from("empreendimentos")
        .select("nome")
        .eq("id", lead.empreendimento_id)
        .eq("grupo_id", candidato.grupo_id)
        .maybeSingle();
      empreendimento = data?.nome ?? null;
    }

    const erroDePreparo =
      !lead ? "Lead nÃ£o encontrado." : !corretor?.ativo ? "Corretor nÃ£o estÃ¡ mais ativo." : !instancia || instancia.status_conexao !== "conectado" || !instancia.conectado_em ? "O nÃºmero central estÃ¡ desconectado." : null;
    if (erroDePreparo) {
      await registrarFalha(supabase, candidato, erroDePreparo, agora);
      continue;
    }
    // O bloco acima recusa todos os nulos. Escrever a guarda de modo direto
    // tambÃ©m deixa isso explÃ­cito para o TypeScript e para quem mexer depois.
    if (!lead || !corretor) continue;

    const resultado = await enviarMensagemWhatsappParaGrupo({
      instanceName: candidato.instance_name,
      grupoJid: candidato.grupo_jid,
      texto: textoDoLeadDistribuido({
        corretor: corretor.nome,
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

    const { error: erroFinal } = await supabase
      .from("lead_envios_grupo")
      .update({
        status: "enviado",
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
