import type { ModoBotWhatsapp } from "./types";
import { decidirPorModo, MINUTOS_COPILOTO, type Expediente } from "./modoBot";
import { inicioDoProximoMesEmSaoPaulo } from "@/lib/planos/cotaDaIa";

/**
 * QUANDO A IA RESPONDE: a decisão inteira, num lugar só.
 *
 * ## Por que este módulo existe (04/10/2026)
 *
 * A decisão de responder estava espalhada em quatro lugares: o webhook
 * (`motivoDoSilencio` + `decidirPorModo`), a varredura de respostas
 * atrasadas (as mesmas duas, chamadas de novo), o cabeçalho da conversa
 * (`estadoDa` + `fraseDoEstado`, que REFAZIAM as condições em vez de
 * chamá-las) e o caminho do áudio não entendido, que olhava só metade e
 * respondia mesmo com o modo mandando calar. Este projeto já pagou uma vez
 * por isso: um selo que olhava duas de três condições mostrou "IA
 * atendendo" por semanas com a IA muda.
 *
 * Agora todos perguntam aqui, e a tela tira a frase da MESMA decisão que o
 * webhook aplicou.
 *
 * ## A regra, em duas camadas, nesta ordem
 *
 * 1. **A conversa** (o que vale para esta pessoa):
 *    - o lead agora é de OUTRO corretor (transferência): este número não
 *      fala mais com ele;
 *    - o lead pediu para não ser contatado (0110);
 *    - a IA está desligada nesta conversa: o corretor falou nela, tocou em
 *      "Desligar IA", ou o cliente recusou contato.
 * 2. **O número** (a configuração do corretor):
 *    - IA desligada no número;
 *    - modo "fora do expediente" e agora é expediente;
 *    - modo co-piloto e o corretor falou há menos de 3 min.
 * 3. **O grupo** (fase 2B, 20/10/2026; fase 2C, 21/10/2026): o grupo está
 *    suspenso por cobrança (atraso de 5 dias ou suspensão da plataforma) ou
 *    a cota de respostas da IA do mês acabou, nessa ordem. Só entra quando
 *    a IA RESPONDERIA: se ela já calaria por outro motivo, o motivo é aquele
 *    (é ele que explica o silêncio de verdade).
 *
 * O primeiro motivo que se aplica é O motivo. A ordem é a de quem tem a
 * palavra final: o que o cliente pediu ganha do que o corretor configurou.
 *
 * ## O que NÃO decide aqui
 *
 * - **Quem entra** (número sem lead): é o porteiro (`porteiro.ts`, 0111) e a
 *   palavra-chave (0146). Sem lead, não existe conversa para decidir.
 * - **Iniciativa nossa** (lembrete de visita): é `podeEnviarPorIniciativa`,
 *   abaixo, porque modo e expediente significam outra coisa quando quem
 *   começa somos nós.
 *
 * A antiga trava de liberação (`liberado_por_palavra_chave`) SAIU: desde a
 * 0111 toda conversa tem lead e desde a 0147 nenhuma nascia nem voltava a
 * travar, então ela só confundia quem investigava (0149-0150).
 *
 * Módulo PURO: sem banco, sem relógio escondido. É o que permite testar a
 * regra inteira e garante que tela e webhook façam a mesma conta.
 */

/*
 * A FALA DO CORRETOR DESLIGA A IA na conversa, sem prazo (decisão do
 * Matheus, 03/10/2026). Antes era uma pausa de 3h que vencia sozinha, e a IA
 * voltava a responder uma conversa que o corretor tinha assumido. Agora ela
 * só volta com ATIVAÇÃO: a palavra-chave no chat, "IA assume agora" ou o
 * envio de uma lista de transmissão para o lead (o corretor entregando a
 * conversa, 03/10/2026).
 */

export type SituacaoDaConversa = {
  /**
   * `false` = desligada nesta conversa: o corretor falou nela, tocou em
   * "Desligar IA", ou o cliente recusou. Só a ativação religa.
   */
  botAtivo: boolean;
  /** O lead pediu para não ser contatado (0110). */
  naoContatar?: boolean;
  /** O lead foi transferido para outro corretor depois desta conversa. */
  leadDeOutroCorretor?: boolean;
};

export type ConfigDoNumero = {
  modo: ModoBotWhatsapp;
  expediente: Expediente | null;
};

export type MotivoDoSilencio =
  | "lead_de_outro_corretor"
  | "lead_pediu_para_sair"
  | "ia_desligada_na_conversa"
  | "ia_desligada_no_numero"
  | "dentro_do_expediente"
  | "corretor_respondendo"
  /** A cota de respostas da IA do grupo acabou neste mês (fase 2B). */
  | "cota_do_grupo"
  /** O grupo está suspenso por cobrança (fase 2C): atraso de 5 dias ou suspensão da plataforma. */
  | "grupo_suspenso";

export type MotivoDaResposta = "sempre_ativa" | "fora_do_expediente" | "corretor_ausente";

export type DecisaoDaIA =
  | { responde: true; motivo: MotivoDaResposta }
  | {
      responde: false;
      motivo: MotivoDoSilencio;
      /** Quando a IA volta sozinha, se volta. `null` = só com ação de alguém. */
      voltaEm: Date | null;
    };

/** Os motivos que são da CONVERSA (e não do número) — o selo da lista só vê estes. */
export const SILENCIOS_DA_CONVERSA = [
  "lead_de_outro_corretor",
  "lead_pediu_para_sair",
  "ia_desligada_na_conversa",
] as const satisfies readonly MotivoDoSilencio[];

function emData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A primeira camada: o que vale para esta pessoa, independente do número. */
export function silencioDaConversa(
  conversa: SituacaoDaConversa,
): { motivo: MotivoDoSilencio; voltaEm: Date | null } | null {
  if (conversa.leadDeOutroCorretor) return { motivo: "lead_de_outro_corretor", voltaEm: null };
  if (conversa.naoContatar) return { motivo: "lead_pediu_para_sair", voltaEm: null };
  if (!conversa.botAtivo) return { motivo: "ia_desligada_na_conversa", voltaEm: null };
  return null;
}

export function decidirSeAIaResponde(params: {
  conversa: SituacaoDaConversa;
  /** `null` = configuração desconhecida (tela sem o número carregado): só a conversa decide. */
  numero: ConfigDoNumero | null;
  /** Só o co-piloto usa; quem não tem a informação manda `null`. */
  ultimaFalaCorretorEm?: string | null;
  /**
   * A cota de respostas da IA do grupo acabou (`lerCotaDaIa`). Ausente =
   * desconhecida: quem não leu a cota (a tela sem ela) não cala por ela.
   */
  cotaEsgotada?: boolean;
  /**
   * O grupo está suspenso por cobrança (`grupoSuspenso`, fase 2C). Ausente =
   * desconhecido: quem não leu a cobrança (a tela sem ela) não cala por ela.
   * Vence a cota: suspenso, o motivo que explica o silêncio é o pagamento.
   */
  grupoSuspenso?: boolean;
  agora?: Date;
}): DecisaoDaIA {
  const agora = params.agora ?? new Date();
  const decisao = decidirSemACota(params, agora);
  if (decisao.responde && params.grupoSuspenso) {
    // Sem `voltaEm`: volta quando a plataforma registrar o pagamento (ou reativar).
    return { responde: false, motivo: "grupo_suspenso", voltaEm: null };
  }
  if (decisao.responde && params.cotaEsgotada) {
    return { responde: false, motivo: "cota_do_grupo", voltaEm: inicioDoProximoMesEmSaoPaulo(agora) };
  }
  return decisao;
}

function decidirSemACota(
  params: { conversa: SituacaoDaConversa; numero: ConfigDoNumero | null; ultimaFalaCorretorEm?: string | null },
  agora: Date,
): DecisaoDaIA {

  const daConversa = silencioDaConversa(params.conversa);
  if (daConversa) return { responde: false, ...daConversa };

  if (!params.numero) return { responde: true, motivo: "sempre_ativa" };

  const modo = decidirPorModo(params.numero.modo, {
    agora,
    expediente: params.numero.expediente,
    ultimaFalaCorretorEm: params.ultimaFalaCorretorEm ?? null,
  });

  switch (modo.motivo) {
    case "desativado":
      return { responde: false, motivo: "ia_desligada_no_numero", voltaEm: null };
    case "dentro_do_expediente":
      return { responde: false, motivo: "dentro_do_expediente", voltaEm: null };
    case "corretor_respondendo": {
      const ultima = emData(params.ultimaFalaCorretorEm);
      return {
        responde: false,
        motivo: "corretor_respondendo",
        voltaEm: ultima ? new Date(ultima.getTime() + MINUTOS_COPILOTO * 60_000) : null,
      };
    }
    case "fora_do_expediente":
      return { responde: true, motivo: "fora_do_expediente" };
    case "corretor_ausente":
      return { responde: true, motivo: "corretor_ausente" };
    case "modo_24_7":
    default:
      return { responde: true, motivo: "sempre_ativa" };
  }
}

/**
 * Mensagem por iniciativa NOSSA (hoje só o lembrete de visita, regra N1).
 *
 * A camada da conversa vale inteira: não se lembra quem saiu da carteira,
 * pediu para sair ou está com a IA desligada (inclusive porque o corretor
 * assumiu a conversa).
 * Da camada do número, só "IA desligada" vale: o modo "fora do expediente" é
 * sobre QUEM RESPONDE, e aplicá-lo aqui faria o lembrete nunca sair para
 * quem usa esse modo — ele tem de sair DENTRO do expediente
 * (`dentroDaJanelaDoCorretor`), exatamente quando o modo diria "não".
 */
export function podeEnviarPorIniciativa(params: {
  conversa: SituacaoDaConversa;
  numero: ConfigDoNumero;
}): DecisaoDaIA {
  const daConversa = silencioDaConversa(params.conversa);
  if (daConversa) return { responde: false, ...daConversa };
  if (params.numero.modo === "desativado") {
    return { responde: false, motivo: "ia_desligada_no_numero", voltaEm: null };
  }
  return { responde: true, motivo: "sempre_ativa" };
}

/**
 * POR QUE a IA está ou não respondendo, em uma frase — para o cabeçalho da
 * conversa. Sai da decisão, nunca de uma conta paralela.
 */
export function fraseDaDecisao(decisao: DecisaoDaIA, numero: ConfigDoNumero | null): string {
  if (decisao.responde) {
    if (decisao.motivo === "fora_do_expediente") return "IA respondendo (fora do seu expediente)";
    if (decisao.motivo === "corretor_ausente" && numero?.modo === "co_piloto_3min") {
      return `IA entra se você ficar ${MINUTOS_COPILOTO} min sem responder`;
    }
    return "IA respondendo";
  }
  switch (decisao.motivo) {
    case "lead_de_outro_corretor":
      return "Lead agora é de outro corretor: a IA não responde neste número";
    case "lead_pediu_para_sair":
      return "Lead pediu para não ser contatado";
    case "ia_desligada_na_conversa":
      return "IA desligada nesta conversa: volta com a palavra-chave ou \"IA assume agora\"";
    case "ia_desligada_no_numero":
      return "IA desligada no seu número";
    case "dentro_do_expediente":
      return numero?.expediente
        ? `Você atende no expediente; a IA volta às ${numero.expediente.fimHora}h`
        : "Você atende no expediente";
    case "corretor_respondendo":
      return `Você está respondendo; a IA entra depois de ${MINUTOS_COPILOTO} min sem você falar`;
    case "cota_do_grupo":
      return "As respostas da IA deste mês acabaram: você responde por aqui até o dia 1º";
    case "grupo_suspenso":
      return "IA pausada: mensalidade em atraso. Você responde por aqui até a plataforma registrar o pagamento";
  }
}

/** O que vai para `ia_interacoes.silencio` (0149): o motivo e o que o explica. */
export function registroDoSilencio(
  decisao: Extract<DecisaoDaIA, { responde: false }>,
  numero: ConfigDoNumero | null,
): {
  motivo: MotivoDoSilencio;
  volta_em: string | null;
  modo: ModoBotWhatsapp | null;
  expediente: Expediente | null;
} {
  return {
    motivo: decisao.motivo,
    volta_em: decisao.voltaEm ? decisao.voltaEm.toISOString() : null,
    modo: numero?.modo ?? null,
    expediente: numero?.expediente ?? null,
  };
}

/**
 * A IA vai responder a este ÁUDIO do cliente? (revisão de 30/10/2026)
 *
 * Lida ANTES da transcrição, para decidir se ela passa pelo teto do dia: a
 * transcrição só fica fora do teto quando a resposta depende do texto. É a
 * MESMA decisão do turno (`decidirSeAIaResponde`), com o que não depende do
 * texto — suspensão, cota, expediente, modo do número, co-piloto — e com o
 * lead de anúncio da Meta já calado pela campanha (o webhook o cala logo
 * depois, `calarIaNaConversaDeCampanha`). O webhook decide de novo, fresco,
 * na hora de responder.
 */
export function aIaVaiResponderAoAudio(p: {
  conversa: SituacaoDaConversa;
  /** Lead que chegou por anúncio da Meta: a campanha cala a IA nele. */
  anuncioMeta: boolean;
  numero: ConfigDoNumero;
  ultimaFalaCorretorEm: string | null;
  cotaEsgotada: boolean;
  grupoSuspenso: boolean;
}): boolean {
  return decidirSeAIaResponde({
    conversa: p.anuncioMeta && p.conversa.botAtivo ? { ...p.conversa, botAtivo: false } : p.conversa,
    numero: p.numero,
    ultimaFalaCorretorEm: p.ultimaFalaCorretorEm,
    cotaEsgotada: p.cotaEsgotada,
    grupoSuspenso: p.grupoSuspenso,
  }).responde;
}
