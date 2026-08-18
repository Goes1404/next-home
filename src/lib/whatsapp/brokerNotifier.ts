import { enviarMensagemWhatsapp, type ResultadoEnvio } from "./provider";

/**
 * Alerta privado no WhatsApp do corretor quando a IA qualifica um lead
 * quente ou o cliente pede visita/atendimento humano.
 */

export interface ParametrosNotificacaoCorretor {
  /** Instância do provedor de onde o alerta sai (a do próprio corretor). */
  instanceName: string;
  telefoneCorretor: string;
  nomeCorretor: string;
  nomeCliente: string;
  telefoneCliente: string;
  empreendimentoNome?: string;
  temperaturaScore: number;
  resumoDossie: string;
  motivoAlerta: "visita_solicitada" | "lead_quente_score_alto" | "transferencia_humana";
}

/** Só monta o texto — separado do envio para poder ser testado sem rede. */
export function formatarAlertaCorretor(
  params: Omit<ParametrosNotificacaoCorretor, "instanceName" | "telefoneCorretor">,
): string {
  const {
    nomeCorretor,
    nomeCliente,
    telefoneCliente,
    empreendimentoNome,
    temperaturaScore,
    resumoDossie,
    motivoAlerta,
  } = params;

  const emojiAlerta =
    motivoAlerta === "visita_solicitada"
      ? "📅 *SOLICITAÇÃO DE VISITA AGENDADA*"
      : motivoAlerta === "lead_quente_score_alto"
      ? "🔥 *NOVO LEAD QUENTE QUALIFICADO (Score " + temperaturaScore + "/100)*"
      : "🚨 *CLIENTE PEDIU ATENDIMENTO HUMANO*";

  return `${emojiAlerta}

Olá, ${nomeCorretor}! A sua assistente virtual acabou de qualificar um cliente de alto padrão:

👤 *Cliente:* ${nomeCliente}
📱 *WhatsApp:* https://wa.me/${telefoneCliente.replace(/\D/g, "")}
🏢 *Interesse Principal:* ${empreendimentoNome || "Imóveis em Alphaville"}

📋 *Resumo do Dossiê:*
${resumoDossie}

💡 *Recomendação:* Entre em contato nos próximos minutos para garantir a melhor taxa de conversão!`;
}

/**
 * Monta e ENVIA o alerta. O `enviado` do retorno reflete a resposta real do
 * provedor: se não houver credenciais configuradas, volta `false` com o
 * motivo — nunca `true` "de mentirinha". Um alerta que se dá por entregue
 * sem ter saído faz o corretor confiar num aviso que nunca chegou.
 */
export async function notificarCorretorLeadQuente(
  params: ParametrosNotificacaoCorretor,
): Promise<ResultadoEnvio & { mensagemFormatada: string }> {
  const mensagemFormatada = formatarAlertaCorretor(params);

  const resultado = await enviarMensagemWhatsapp({
    instanceName: params.instanceName,
    telefone: params.telefoneCorretor,
    texto: mensagemFormatada,
  });

  if (!resultado.enviado) {
    console.warn(
      `Alerta de lead quente NÃO enviado ao corretor ${params.nomeCorretor} (${resultado.motivo}): ${resultado.detalhe ?? ""}`,
    );
  }

  return { ...resultado, mensagemFormatada };
}
