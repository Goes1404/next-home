import type { ModoBotWhatsapp } from "./types";

/**
 * Decide se o bot pode falar AGORA, segundo o modo escolhido pelo corretor.
 *
 * Existia como enum no banco, botão no painel e tipo em TypeScript — mas sem
 * nenhuma linha de lógica: o webhook só testava `=== "desativado"`, então
 * quem escolhia "noturno e fim de semana" ou "co-piloto" continuava com bot
 * 24/7 sem perceber. Um controle que não controla é pior que controle
 * nenhum, porque o corretor confia nele.
 *
 * A decisão é uma função pura de propósito: o webhook não é lugar de
 * descobrir regra de horário, e regra de horário sem teste é regra que
 * ninguém confere.
 */

export type DecisaoModo = {
  pode: boolean;
  /** Chave curta para log e para a resposta do webhook. */
  motivo:
    | "modo_24_7"
    | "fora_do_expediente"
    | "corretor_ausente"
    | "desativado"
    | "dentro_do_expediente"
    | "corretor_respondendo";
};

/** Expediente comercial, em America/Sao_Paulo — a hora do cliente, não a do servidor. */
export const EXPEDIENTE = { inicioHora: 9, fimHora: 18, fusoHorario: "America/Sao_Paulo" } as const;

/**
 * Janela do co-piloto: o bot só entra se o corretor não falou nos últimos
 * minutos.
 *
 * ATENÇÃO ao que isto NÃO é: não existe agendamento aqui. O nome "3 min"
 * sugere "espere 3 minutos e responda se o humano não responder", e isso
 * exigiria uma fila com execução adiada — o webhook responde na hora e
 * morre. O que dá para garantir sem fila é o inverso, que resolve o mesmo
 * problema na prática: enquanto o corretor está ativo na conversa, o bot
 * fica quieto; passados os 3 minutos de silêncio dele, o bot assume.
 */
export const MINUTOS_COPILOTO = 3;

type Contexto = {
  agora?: Date;
  /** ISO da última mensagem enviada pelo corretor nesta conversa. */
  ultimaFalaCorretorEm?: string | null;
};

/**
 * Hora e dia da semana em um fuso, sem depender do relógio do servidor —
 * que na Vercel roda em UTC e faria "noturno" começar três horas cedo.
 */
function horaLocal(agora: Date, fusoHorario: string): { hora: number; diaSemana: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fusoHorario,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const sigla = partes.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return { hora: hora === 24 ? 0 : hora, diaSemana: Math.max(0, dias.indexOf(sigla)) };
}

/** Segunda a sexta, entre o início e o fim do expediente. */
export function dentroDoExpediente(agora: Date): boolean {
  const { hora, diaSemana } = horaLocal(agora, EXPEDIENTE.fusoHorario);
  const diaUtil = diaSemana >= 1 && diaSemana <= 5;
  return diaUtil && hora >= EXPEDIENTE.inicioHora && hora < EXPEDIENTE.fimHora;
}

export function decidirPorModo(modo: ModoBotWhatsapp, ctx: Contexto = {}): DecisaoModo {
  const agora = ctx.agora ?? new Date();

  switch (modo) {
    case "desativado":
      return { pode: false, motivo: "desativado" };

    case "noturno_e_fds":
      // De dia e em dia útil quem atende é o corretor; a IA cobre o resto,
      // que é justamente quando o lead chega e ninguém está olhando.
      return dentroDoExpediente(agora)
        ? { pode: false, motivo: "dentro_do_expediente" }
        : { pode: true, motivo: "fora_do_expediente" };

    case "co_piloto_3min": {
      if (!ctx.ultimaFalaCorretorEm) return { pode: true, motivo: "corretor_ausente" };

      const silencioMs = agora.getTime() - new Date(ctx.ultimaFalaCorretorEm).getTime();
      // Data inválida vira NaN; não deixar o bot mudo por causa disso.
      if (Number.isNaN(silencioMs)) return { pode: true, motivo: "corretor_ausente" };

      return silencioMs >= MINUTOS_COPILOTO * 60_000
        ? { pode: true, motivo: "corretor_ausente" }
        : { pode: false, motivo: "corretor_respondendo" };
    }

    case "24_7":
    default:
      return { pode: true, motivo: "modo_24_7" };
  }
}

/** Texto curto do modo, para o painel e para a lista de conversas. */
export const ROTULO_MODO: Record<ModoBotWhatsapp, string> = {
  "24_7": "Sempre ativa",
  noturno_e_fds: `Fora do expediente (após ${EXPEDIENTE.fimHora}h, antes das ${EXPEDIENTE.inicioHora}h e fins de semana)`,
  co_piloto_3min: `Co-piloto (entra após ${MINUTOS_COPILOTO} min de silêncio seu)`,
  desativado: "Desligada",
};

/**
 * Ativação por palavra-chave manual do corretor.
 *
 * Complementa (não substitui) `decidirPorModo`: o modo decide QUANDO a IA
 * pode falar; a palavra-chave decide SE ela já foi autorizada a entrar
 * nesta conversa específica. Um corretor que atende pessoalmente do celular
 * e, em algum ponto, digita a frase combinada está dizendo "pode assumir
 * daqui" — sem isso, o WhatsApp não tem outro jeito de diferenciar "estou
 * respondendo pessoalmente" de "pode voltar a responder por mim".
 */

/** Minúsculas e sem acento — "Pode Ativar" e "pode ativar" não podem ser sinais diferentes. */
function normalizarParaComparacao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Tamanho mínimo de uma palavra-chave.
 *
 * Guarda contra o pior acidente possível deste campo: uma chave de uma ou
 * duas letras ("a", "ok") aparece dentro de quase toda mensagem, e a IA
 * assumiria a conversa na primeira coisa que o corretor digitasse — numa
 * linha PESSOAL, é o caso da conversa da família de novo. Chave curta
 * demais é descartada em silêncio, nunca aceita "quase".
 */
const MINIMO_PALAVRA_CHAVE = 3;

/**
 * As palavras-chave cadastradas neste campo.
 *
 * O corretor pode cadastrar VÁRIAS, separadas por vírgula (pedido de
 * 26/08/2026): na prática ele não lembra da frase exata no meio do
 * atendimento, e uma chave só significava recorrer ao painel para
 * consultá-la — atrito que fazia o recurso não ser usado. O campo continua
 * sendo texto (nenhuma migration): a lista mora nele, separada por vírgula.
 */
export function listarPalavrasChave(campo: string | null | undefined): string[] {
  return (campo ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length >= MINIMO_PALAVRA_CHAVE);
}

/** A mensagem (enviada pelo corretor) contém ALGUMA das palavras-chave cadastradas? */
export function contemPalavraChave(mensagem: string, palavraChave: string | null | undefined): boolean {
  const chaves = listarPalavrasChave(palavraChave);
  if (chaves.length === 0) return false;
  const texto = normalizarParaComparacao(mensagem);
  return chaves.some((chave) => texto.includes(normalizarParaComparacao(chave)));
}

/**
 * Se esta conversa precisa aguardar a palavra-chave antes da IA poder
 * responder ao cliente.
 *
 * Só existe trava quando o corretor cadastrou uma palavra-chave — sem uma
 * configurada, o recurso está desligado e ninguém fica esperando por nada.
 *
 * Duas isenções, e as duas significam a mesma coisa: **nós já sabemos que
 * este número é cliente.**
 *
 * 1. **Campanha.** Quem dispara em massa pelo próprio CRM já decidiu que a
 *    IA participa.
 * 2. **O número já era do CRM antes desta conversa** (`jaEraDoCrm`). Ele foi
 *    importado, veio de formulário do site ou foi cadastrado à mão — em
 *    todos os casos alguém o pôs lá de propósito.
 *
 * A segunda isenção é o que faz a trava parar de ser silêncio e virar
 * incentivo. Medido em 24/08/2026: a instância roda no WhatsApp PESSOAL do
 * corretor, então a trava tem razão de existir — mas do jeito antigo ela
 * travava cliente junto com cunhado, e o resultado foi 172 mensagens de
 * cliente e ZERO respostas. Agora quem cadastra o lead é atendido; quem não
 * cadastra continua esperando a palavra.
 *
 * O detalhe que faz a regra funcionar: "já era do CRM" significa que o lead
 * existia ANTES desta conversa. O webhook CRIA o lead de quem escreve (foi a
 * correção da 0026, sem a qual nenhum lead nascia de WhatsApp), então "tem
 * lead" seria verdade para todo mundo no instante em que a pessoa manda a
 * primeira mensagem — e a checagem passaria sempre, valendo nada.
 */
export function exigePalavraChave(params: {
  palavraChaveConfigurada: string | null | undefined;
  /** A de teste também liga a trava: ter qualquer uma cadastrada é ter o recurso ligado. */
  palavraChaveTeste?: string | null;
  origemConversa: "organica" | "campanha";
  /** O telefone já tinha lead no CRM ANTES desta conversa começar. */
  jaEraDoCrm?: boolean;
}): boolean {
  // Pela LISTA, não pelo campo: um campo com "a, ok" (chaves curtas demais,
  // todas descartadas) não pode ligar a trava — travaria a IA sem existir
  // palavra nenhuma capaz de destravá-la.
  const temAlguma =
    listarPalavrasChave(params.palavraChaveConfigurada).length > 0 ||
    listarPalavrasChave(params.palavraChaveTeste).length > 0;
  if (!temAlguma) return false;
  if (params.origemConversa === "campanha") return false;
  if (params.jaEraDoCrm) return false;
  return true;
}

/**
 * O que fazer quando o CORRETOR fala na conversa.
 *
 * A palavra-chave só LIGA a IA; qualquer outra fala do corretor a
 * DESLIGA de novo. Antes, a liberação era permanente — `liberado_por_
 * palavra_chave` só sabia virar `true`, nunca voltar — e o único freio
 * era a pausa de 24h de `pausado_humano_ate`, que se renova a cada
 * mensagem e vence sozinha. Numa linha PESSOAL (o caso real: a instância
 * roda no WhatsApp que o corretor usa com a família) isso significa que
 * bastava ele passar 24h sem falar com alguém para a IA assumir aquela
 * conversa e começar a oferecer imóvel. Foi o que aconteceu em teste com
 * a conversa da mãe dele.
 *
 * Como efeito colateral desejado, isto também cura as conversas que
 * NASCERAM liberadas: `obterOuCriarConversa` congela a decisão no INSERT,
 * então toda conversa criada antes de existir palavra-chave ficou com
 * `liberado = true` para sempre. Com o retravamento, a primeira fala do
 * corretor nessas conversas as devolve ao estado bloqueado — sem
 * backfill.
 *
 * O retravamento só vale quando há palavra-chave cadastrada: sem ela o
 * recurso está desligado, e travar seria emudecer a IA sem nenhum jeito
 * de destravá-la.
 */
export type DecisaoFalaDoCorretor =
  | { acao: "ativar_ia"; marcarComoTeste: boolean }
  | { acao: "pausar_ia"; retravarPalavraChave: boolean };

export function decidirPorFalaDoCorretor(params: {
  mensagem: string;
  palavraChaveConfigurada: string | null | undefined;
  /**
   * Palavra que liga a IA E marca a conversa como teste. Existe porque o
   * corretor continua testando pelo WhatsApp de verdade durante o piloto, e
   * essas conversas nascem como REAIS — indo parar no few-shot que entra no
   * prompt. Foi assim que 46 conversas de teste viraram exemplo de
   * atendimento bom (ver migrations 0038 e 0039).
   */
  palavraChaveTeste?: string | null;
  origemConversa: "organica" | "campanha";
  /**
   * O telefone já era do CRM antes desta conversa (0049).
   *
   * Para cliente conhecido, a fala do corretor PAUSA mas não retrava: a
   * pausa de 24h vence e a IA volta sozinha. Retravar aqui significaria que
   * uma única mensagem dele — "te ligo já" — desliga a IA naquele lead para
   * sempre, e ele nem fica sabendo.
   *
   * Para número desconhecido a trava continua inteira. É ela que protege a
   * conversa da família, e o caso que a motivou foi real: em teste, a IA
   * assumiu a conversa da mãe do corretor e começou a oferecer imóvel.
   */
  clienteConhecido?: boolean;
}): DecisaoFalaDoCorretor {
  /*
   * A de teste é conferida PRIMEIRO. Se as duas palavras casarem com a
   * mesma mensagem, marcar teste é o desfecho seguro: uma conversa real
   * marcada como teste custa um exemplo a menos no corpus; uma de teste
   * marcada como real envenena o prompt.
   */
  if (contemPalavraChave(params.mensagem, params.palavraChaveTeste)) {
    return { acao: "ativar_ia", marcarComoTeste: true };
  }

  if (contemPalavraChave(params.mensagem, params.palavraChaveConfigurada)) {
    return { acao: "ativar_ia", marcarComoTeste: false };
  }

  return {
    acao: "pausar_ia",
    retravarPalavraChave: exigePalavraChave({
      palavraChaveConfigurada: params.palavraChaveConfigurada,
      palavraChaveTeste: params.palavraChaveTeste,
      origemConversa: params.origemConversa,
      jaEraDoCrm: params.clienteConhecido,
    }),
  };
}
