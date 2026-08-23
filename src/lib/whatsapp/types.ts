/**
 * Tipos e Estruturas para o Sistema Multi-WhatsApp, Agente IA e Campanhas
 */

export type StatusConexaoWhatsapp = "desconectado" | "conectando" | "conectado";
export type ModoBotWhatsapp = "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado";
export type TomVozBot = "consultivo_alto_padrao" | "formal_direto" | "descontraido_acolhedor";

export interface InstanciaWhatsappCorretor {
  id: string;
  corretorId: string;
  instanceName: string;
  statusConexao: StatusConexaoWhatsapp;
  telefoneConectado: string | null;
  qrcodeBase64: string | null;
  modoBot: ModoBotWhatsapp;
  nomeAssistente: string;
  tomVoz: TomVozBot;
  webhookSecret: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversaWhatsapp {
  id: string;
  corretorId: string;
  leadId: string | null;
  telefoneCliente: string;
  nomeCliente: string | null;
  botAtivo: boolean;
  pausadoHumanoAte: string | null;
  ultimaMensagem: string | null;
  ultimaInteracaoEm: string;
  createdAt: string;
}

export interface MensagemWhatsapp {
  id: string;
  conversaId: string;
  remetente: "cliente" | "bot" | "corretor";
  tipo: "texto" | "audio" | "imagem" | "documento";
  conteudo: string;
  midiaUrl: string | null;
  createdAt: string;
}

export interface CampanhaWhatsapp {
  id: string;
  corretorId: string;
  titulo: string;
  empreendimentoId: string | null;
  mensagemBase: string;
  totalLeads: number;
  totalEnviados: number;
  totalRespondidos: number;
  status: "rascunho" | "em_andamento" | "pausada" | "concluida";
  createdAt: string;
}

export interface ItemFilaCampanha {
  id: string;
  campanhaId: string;
  leadId: string | null;
  telefone: string;
  mensagemPersonalizada: string;
  /**
   * Se a variação por IA realmente rodou neste item. `false` significa que
   * o texto saiu do template puro — a proteção anti-ban de variação NÃO
   * está valendo, e a UI precisa poder avisar o corretor.
   */
  personalizadoPorIA: boolean;
  status: "pendente" | "enviado" | "erro" | "respondido";
  agendadoPara: string;
  enviadoEm: string | null;
  respostaEm: string | null;
  erroMotivo: string | null;
  createdAt: string;
}

export type TemperaturaLeadLabel = "quente" | "morno" | "frio";

export interface DossieClienteIA {
  id: string;
  leadId: string;
  orcamentoMin: number | null;
  orcamentoMax: number | null;
  /**
   * Renda média mensal declarada. NÃO é o mesmo que orçamento: orçamento é
   * quanto a pessoa quer gastar no imóvel, renda é quanto entra por mês — e
   * é a renda que decide o que o banco financia.
   */
  rendaMensal: number | null;
  formaPagamento: string | null;
  perfilFamiliar: string | null;
  urgenciaMudanca: string | null;
  exigenciasEspecificas: string[];
  objecoesIdentificadas: string[];
  temperaturaScore: number; // 0 a 100
  temperaturaLabel: TemperaturaLeadLabel;
  resumoExecutivo: string;
  proximoPassoSugerido: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayloadWebhookMensagem {
  instance: string;
  sender: string;
  senderName?: string;
  fromMe: boolean;
  messageType: "text" | "audio" | "image" | "document";
  text?: string;
  audioBase64OrUrl?: string;
  mediaUrl?: string;
  timestamp: number;
}
