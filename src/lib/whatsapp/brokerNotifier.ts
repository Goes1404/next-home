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
  /**
   * A região da casa do grupo (`casa.ts`), para quando a conversa ainda não
   * citou imóvel. Era "Imóveis em Alphaville" fixo, para o corretor de
   * qualquer grupo (revisão da fase 4, 20/10/2026).
   */
  regiaoDaCasa?: string | null;
  temperaturaScore: number;
  resumoDossie: string;
  motivoAlerta:
    | "visita_solicitada"
    | "visita_confirmada"
    /** O cliente trocou a data pela conversa; o CRM já está com a nova (A2). */
    | "visita_remarcada"
    /** O cliente disse que não vai; a visita já saiu do CRM (A2). */
    | "visita_desmarcada"
    | "lead_quente_score_alto"
    | "transferencia_humana"
    /** O cliente pediu para ser ligado. Quem liga é o corretor — ver `pedidoDeLigacao.ts`. */
    | "ligacao_solicitada"
    /** A assistente disse ao cliente que o corretor traz uma resposta. Ver `promessaDeRetorno.ts`. */
    | "duvida_pendente";
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
    regiaoDaCasa,
    temperaturaScore,
    resumoDossie,
    motivoAlerta,
  } = params;
  const interesse = empreendimentoNome || (regiaoDaCasa?.trim() ? `Imóveis em ${regiaoDaCasa.trim()}` : "Ainda não definido");

  const emojiAlerta =
    motivoAlerta === "visita_confirmada"
      ? "✅ *VISITA CONFIRMADA PELA IA — JÁ ESTÁ NO SEU FUNIL*"
      : motivoAlerta === "visita_remarcada"
      ? "🔁 *VISITA REMARCADA PELO CLIENTE — A DATA NOVA JÁ ESTÁ NO SEU FUNIL*"
      : motivoAlerta === "visita_desmarcada"
      ? "❌ *VISITA DESMARCADA PELO CLIENTE — JÁ SAIU DA SUA AGENDA*"
      : motivoAlerta === "visita_solicitada"
      ? "📅 *SOLICITAÇÃO DE VISITA AGENDADA*"
      : motivoAlerta === "lead_quente_score_alto"
      ? "🔥 *NOVO LEAD QUENTE QUALIFICADO (Score " + temperaturaScore + "/100)*"
      /*
       * Este precisa dizer o que fazer, não o que aconteceu: a assistente
       * já respondeu ao cliente que a ligação acontece. Quem cumpre isso é
       * o corretor, e se ele ler "cliente pediu atendimento humano" pode
       * responder por escrito e deixar a promessa no ar.
       */
      : motivoAlerta === "ligacao_solicitada"
      ? "📞 *CLIENTE PEDIU LIGAÇÃO — LIGUE PARA ELE*"
      : motivoAlerta === "duvida_pendente"
      ? "❓ *A ASSISTENTE DISSE QUE VOCÊ RESPONDE — O CLIENTE ESTÁ ESPERANDO*"
      : "🚨 *CLIENTE PEDIU ATENDIMENTO HUMANO*";

  return `${emojiAlerta}

Olá, ${nomeCorretor}! A sua assistente virtual acabou de qualificar um cliente de alto padrão:

👤 *Cliente:* ${nomeCliente}
📱 *WhatsApp:* https://wa.me/${telefoneCliente.replace(/\D/g, "")}
🏢 *Interesse Principal:* ${interesse}

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

export interface ParametrosAtualizacaoDossie {
  nomeCliente: string;
  telefoneCliente: string;
  /** Já formatado por `detectarEvolucao` (evolucaoConversa.ts) — uma ou mais linhas com emoji. */
  resumoMudancas: string;
}

/**
 * Nota curta de acompanhamento — não é o alerta de lead quente (aquele pede
 * ação imediata); este é só "a conversa andou, aqui está o que mudou". Só
 * texto — separado do envio para poder ser testado sem rede, mesma razão de
 * `formatarAlertaCorretor`.
 */
export function formatarAtualizacaoDossie(params: ParametrosAtualizacaoDossie): string {
  return `📊 *Atualização do atendimento*

*${params.nomeCliente}* (${params.telefoneCliente}) avançou na conversa:

${params.resumoMudancas}

A assistente continua conduzindo — isto é só para você acompanhar.`;
}

/** Envia a nota de acompanhamento. Mesmo contrato de honestidade de `notificarCorretorLeadQuente`. */
export async function notificarAtualizacaoCorretor(
  params: ParametrosAtualizacaoDossie & { instanceName: string; telefoneCorretor: string },
): Promise<ResultadoEnvio & { mensagemFormatada: string }> {
  const mensagemFormatada = formatarAtualizacaoDossie(params);

  const resultado = await enviarMensagemWhatsapp({
    instanceName: params.instanceName,
    telefone: params.telefoneCorretor,
    texto: mensagemFormatada,
  });

  if (!resultado.enviado) {
    console.warn(
      `Atualização de dossiê NÃO enviada ao corretor (${resultado.motivo}): ${resultado.detalhe ?? ""}`,
    );
  }

  return { ...resultado, mensagemFormatada };
}
