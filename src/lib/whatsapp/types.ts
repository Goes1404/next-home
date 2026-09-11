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
  /** Qual versão da mensagem este item usou (teste A/B, 0084). Null = campanha de uma versão. */
  variante?: "A" | "B" | null;
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
  /**
   * Região onde o cliente procura imóvel, extraída da conversa ("Centro de
   * Barueri", "Alphaville"...). Como a renda, mora em `leads`
   * (`regiao_interesse`) — é de lá que a ficha do CRM e o painel de
   * conversas leem — e só é escrita quando a extração acha valor.
   */
  regiaoInteresse: string | null;
  /**
   * Dormitórios que o cliente pediu. Como a região e a renda: mora em
   * `leads.dormitorios_min` (a coluna existia desde sempre e ninguém
   * escrevia — mesma família do defeito do orçamento) e só é escrita
   * quando a extração acha valor.
   */
  dormitoriosMin: number | null;
  /**
   * O nome que o CLIENTE disse na conversa.
   *
   * Existe porque a ficha dele está vazia: medido em 11/09/2026, os 55
   * leads que conversaram com a IA se chamam todos "WhatsApp 2461". O
   * caminho que renomeava o lead pelo nome do contato do WhatsApp
   * (`whatsapp_conversas.nome_cliente`) está em 0 de 140 e nunca rodou —
   * então o nome tem de vir da conversa.
   *
   * A régua é APERTADA de propósito, e mora no prompt: só apresentação
   * inequívoca ("meu nome é", "sou o/a", assinatura). "Vou ver com o João"
   * não é o nome dele, e um lead renomeado errado é pior que um lead sem
   * nome — o corretor chama a pessoa pelo nome errado na primeira frase.
   */
  nomeCliente: string | null;
  /** O e-mail, quando ELE escreve. Nunca deduzido. */
  email: string | null;
  /**
   * A MEMÓRIA da conversa: o estado da negociação em prosa curta.
   *
   * Não é transcrição nem resumo executivo (que é leitura do momento, para
   * o corretor ler). É o que a IA carrega para a próxima mensagem quando a
   * janela de 40 falas já não alcança o que foi dito — e nas conversas
   * ativas até 27 dessas 40 são do corretor.
   */
  memoria: string | null;
  formaPagamento: string | null;
  /**
   * Com o que o cliente trabalha, nas palavras dele. Serve para o corretor
   * preparar a conversa de financiamento — NUNCA para deduzir renda: saber
   * a profissão não diz quanto alguém ganha, e um chute vira promessa.
   */
  profissao: string | null;
  /** A compra soma renda com outra pessoa? Muda o que o banco financia. */
  compraEmConjunto: boolean | null;
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
