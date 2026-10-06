import { normalizar } from "./normalizarFala";
import type { FamiliaDeRecusa, Recusa } from "./recusaDoCliente";

/**
 * Recusa em camadas (06/10/2026): a parte PURA.
 *
 * Regex nenhuma cobre o português inteiro: cada frase nova que escapa pede um
 * remendo, e o remendo abre espaço para a próxima. Por isso a decisão passou
 * a ter três camadas:
 *
 * 1. `detectarRecusa` (regex) decide sozinha o que é certeza. É de graça e
 *    roda em toda mensagem.
 * 2. O que a regex não pegou e tem SINAL NEGATIVO (`temSinalNegativo`) vai a
 *    uma chamada curta à IA, com a última fala nossa como contexto: "não"
 *    depois de "pronto ou na planta?" é resposta; depois de "quer receber
 *    novidades?" é recusa. A regex não enxerga contexto; a IA enxerga.
 * 3. Toda decisão é registrada (`recusas_detectadas`), e o "Liberar contato"
 *    do corretor vira o rótulo de falso positivo. É o que deixa medir.
 *
 * O erro continua assimétrico, e é por isso que a IA só decide com
 * confiança alta (`CONFIANCA_MINIMA`) e com o trecho copiado da própria fala
 * do cliente (`lerVeredito`): sem isso, uma resposta inventada da IA viraria
 * lead marcado como "não quer contato".
 *
 * Quem chama a IA é `classificarRecusa.ts` (server-only); este módulo não
 * toca em rede, e é testável inteiro.
 */

export const CONFIANCA_MINIMA = 0.8;

/**
 * O filtro largo e barato: só passa para a IA a mensagem com algum sinal de
 * "não". Erro aqui é assimétrico ao contrário: deixar de mandar uma recusa
 * para a IA é perdê-la, mandar uma mensagem neutra custa um décimo de
 * centavo. Por isso ele é largo de propósito, e o conjunto de frases de
 * referência exige que TODA recusa conhecida passe por ele.
 */
const SINAL_NEGATIVO =
  /\b(nao|n|num|nada|nunca|nem|chega|pare|para de|parar|sair|saia|sai|stop|cancel\w*|bloque\w*|interess\w*|obrigad\w*|dispens\w*|deixa pra la|deixa quieto|esquece|esquecer|tira|tirar|remov\w*|apag\w*|exclu\w*|delet\w*|desist\w*|ja (comprei|tenho|tem|fechei|resolvi|aluguei|escolhi|consegui|estou)|sem condic\w*|incomod\w*|spam|engano|errad\w*|quem e (voce|vc)|quem (fala|ta falando)|nao conheco|chato|encher|perturb\w*|denunci\w*|procon|me deixa|depois|mais pra frente|ano que vem|agora nao|por enquanto|fechei|comprei|aluguei|outra imobiliaria|outro corretor|outra corretora)\b/;

export function temSinalNegativo(texto: string): boolean {
  const t = normalizar(texto).trim();
  if (!t || t.startsWith("[mensagem")) return false;
  return SINAL_NEGATIVO.test(t);
}

export function montarPromptDeRecusa(p: { ultimaFalaNossa: string; falaDoCliente: string }): string {
  const nossa = p.ultimaFalaNossa.trim() || "(nenhuma — o cliente escreveu primeiro)";
  return [
    "Você classifica a última mensagem de um cliente que conversa com uma imobiliária pelo WhatsApp.",
    "A pergunta é uma só: o cliente está dizendo que NÃO quer mais ser atendido ou contatado?",
    "",
    "Categorias:",
    '- "parada": pede para parar de receber mensagens, sair da lista, ser esquecido, ter o contato apagado, ameaça bloquear ou denunciar, ou diz que é número errado / não conhece a empresa.',
    '- "desinteresse": diz que não tem interesse no atendimento ou em comprar agora (mesmo que seja temporário: "agora não", "talvez ano que vem").',
    '- "ja_resolvido": já comprou, alugou, fechou com outra empresa ou já tem corretor que o atende.',
    '- "nenhuma": qualquer outra coisa.',
    "",
    'Isto é "nenhuma", e é o erro mais caro confundir:',
    '- recusa de UM detalhe enquanto continua escolhendo ("não quero na planta", "não tenho interesse em Alphaville", "não quero 2 dormitórios");',
    '- recusa de um horário ("não posso sábado", "hoje não dá");',
    '- objeção de preço ("tá caro", "não cabe no meu bolso") e saída suave ("vou pensar", "vou ver com minha esposa");',
    '- resposta "não" a uma pergunta do funil ("é pronto ou na planta?" → "não sei", "não");',
    "- reclamação de que não recebeu algo que pediu.",
    "",
    "Em dúvida, responda \"nenhuma\" com confiança baixa.",
    "",
    `Última mensagem nossa (contexto): """${nossa}"""`,
    `Mensagem do cliente: """${p.falaDoCliente.trim()}"""`,
    "",
    'Responda só com JSON: {"familia": "parada" | "desinteresse" | "ja_resolvido" | "nenhuma", "confianca": número de 0 a 1, "trecho": "copie EXATAMENTE as palavras da mensagem do cliente que decidem"}',
  ].join("\n");
}

export type VereditoDeRecusa = {
  familia: FamiliaDeRecusa | "nenhuma";
  confianca: number;
  trecho: string;
};

const FAMILIAS = new Set(["parada", "desinteresse", "ja_resolvido", "nenhuma"]);

/**
 * Lê o JSON da IA e recusa o que não for verificável. O trecho precisa
 * existir na fala do cliente: é ele que vai para a linha do tempo e para o
 * aviso ao corretor, e trecho inventado é a IA pondo palavras na boca de
 * quem não as disse.
 */
export function lerVeredito(json: unknown, falaDoCliente: string): VereditoDeRecusa | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const familia = typeof o.familia === "string" ? o.familia : "";
  if (!FAMILIAS.has(familia)) return null;
  const confianca = typeof o.confianca === "number" ? o.confianca : Number(o.confianca);
  if (!Number.isFinite(confianca) || confianca < 0 || confianca > 1) return null;
  const trecho = typeof o.trecho === "string" ? o.trecho.trim() : "";
  if (familia !== "nenhuma") {
    if (!trecho) return null;
    if (!normalizar(falaDoCliente).includes(normalizar(trecho))) return null;
  }
  return { familia: familia as VereditoDeRecusa["familia"], confianca, trecho };
}

/** O veredito vira recusa só com família de verdade e confiança alta. */
export function recusaDoVeredito(v: VereditoDeRecusa | null): Recusa | null {
  if (!v || v.familia === "nenhuma" || v.confianca < CONFIANCA_MINIMA) return null;
  return { familia: v.familia, trecho: v.trecho };
}

/** Quem decidiu, para a telemetria. */
export type ClassificacaoDeRecusa = {
  recusa: Recusa | null;
  decididoPor: "regex" | "ia" | null;
  /** O que a IA disse, mesmo quando não deu para agir (baixa confiança). */
  veredito: VereditoDeRecusa | null;
  modelo: string | null;
};
