/**
 * A IA não mente sobre o que é. Guarda DETERMINÍSTICA, não regra de prompt.
 *
 * O prompt sempre proibiu negar ser IA quando perguntada diretamente — e em
 * 25/08/2026 a fábrica de conversas flagrou a resposta "Sou humana" DUAS
 * vezes na mesma conversa, sob pressão de um cliente que perguntou "robô?
 * humano?" sem rodeios. Instrução de prompt é probabilística e falha justo
 * na resposta que importa; é a mesma lição que criou `semValores` e
 * `resolverMidia`.
 *
 * O que a guarda faz: a FRASE que afirma humanidade (ou nega ser robô/IA)
 * é trocada por uma apresentação honesta. Trocar só a palavra deixaria a
 * frase quebrada; deixar passar é mentira ao consumidor — e mentira
 * descoberta mata a confiança na marca inteira, não só na conversa.
 *
 * Ela também segura o caso irmão, flagrado na mesma conversa: a assistente
 * se apresentando com o CRECI do corretor como se fosse dela ("sou Sofia,
 * consultora, CRECI 254161"). CRECI é registro profissional de pessoa
 * física; no texto da assistente ele só aparece apresentando o CORRETOR.
 *
 * O que ela NÃO faz: vetar a palavra "assistente", impedir a Sofia de dar
 * o próprio nome, ou responder "sou uma IA" espontaneamente — a regra de
 * negócio continua sendo não levantar o assunto; só não mentir quando ele
 * for levantado.
 */

const AFIRMA_HUMANIDADE = [
  // "sou humana", "eu sou um humano", "sou uma pessoa (real/de verdade)"
  /\b(?:eu\s+)?sou\s+(?:um[a]?\s+)?(?:human[oa]|pessoa(?:\s+(?:real|de\s+verdade|f[ií]sica))?|gente(?:\s+de\s+verdade)?)\b/i,
  // "não sou (um) robô/bot/máquina/IA/inteligência artificial"
  /\bn[aã]o\s+sou\s+(?:um[a]?\s+)?(?:rob[oô]|bot|m[aá]quina|ia\b|intelig[eê]ncia(?:\s+artificial)?|assistente\s+virtual|atendimento\s+autom[aá]tico)/i,
  // "sou de carne e osso"
  /\bsou\s+de\s+carne\s+e\s+osso\b/i,
];

/** "sou ... CRECI 12345" na mesma frase: a assistente vestindo o registro do corretor. */
const VESTE_CRECI = /\b(?:eu\s+)?sou\b[^.!?\n]*\bcreci\b/i;

function frasesDe(texto: string): string[] {
  // Quebra que preserva o delimitador junto da frase, para reconstruir sem
  // perder pontuação nem os separadores de balão ("---", parágrafo duplo).
  return texto.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ü])|\n/).filter((f) => f.length > 0);
}

export type IdentidadeVerificada = {
  texto: string;
  /** Alguma frase mentia sobre a natureza da assistente? (telemetria) */
  corrigiu: boolean;
};

export function manterIdentidadeHonesta(
  texto: string,
  nomeAssistente?: string | null,
): IdentidadeVerificada {
  if (!texto) return { texto, corrigiu: false };

  const nome = nomeAssistente?.trim() || "a assistente digital da equipe";
  const apresentacaoHonesta =
    nomeAssistente?.trim()
      ? `Aqui é a ${nome}, assistente digital da equipe — pode seguir comigo por aqui que eu te ajudo em tudo.`
      : `Aqui é ${nome} — pode seguir comigo por aqui que eu te ajudo em tudo.`;

  let corrigiu = false;
  let jaApresentou = false;

  const frases = frasesDe(texto).map((frase) => {
    const mente = AFIRMA_HUMANIDADE.some((p) => p.test(frase)) || VESTE_CRECI.test(frase);
    if (!mente) return frase;

    corrigiu = true;
    // Uma apresentação honesta por resposta; a segunda frase mentirosa
    // simplesmente sai — repetir a apresentação soaria tão robótico quanto.
    if (jaApresentou) return "";
    jaApresentou = true;
    return apresentacaoHonesta;
  });

  if (!corrigiu) return { texto, corrigiu: false };

  const resultado = frases
    .filter((f) => f.length > 0)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { texto: resultado, corrigiu: true };
}
