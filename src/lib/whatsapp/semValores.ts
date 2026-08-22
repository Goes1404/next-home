/**
 * A IA não fala preço. Nunca.
 *
 * Decisão comercial da imobiliária: valor é conversa de corretor, não de
 * assistente. Um número dito no WhatsApp vira expectativa — e quando a
 * tabela muda, ou o desconto depende de forma de pagamento, quem paga a
 * conta da frustração é o corretor.
 *
 * Isto mora aqui, e não só no prompt, pelo mesmo motivo de `vozHumana.ts`:
 * instrução de prompt é probabilística. O modelo obedece na maioria das
 * vezes e escorrega justo na resposta que importa — e aqui o escorregão
 * não é feio, é um compromisso comercial feito por um robô.
 *
 * A segunda linha de defesa é o prompt não mostrar preço nenhum no
 * catálogo: o que o modelo não vê, ele não repete.
 */

/**
 * Frase de valor que o modelo às vezes solta, mesmo instruído.
 *
 * Cobre "R$ 1.289.900", "1,2 milhão", "800 mil", "a partir de 460.000" —
 * e deixa passar número que claramente não é dinheiro (metragem, ano,
 * quantidade de dormitórios, horário).
 */
const PADROES_DE_VALOR: RegExp[] = [
  /R\$\s?[\d.,]+/gi,
  /\b\d{1,3}(?:[.\s]\d{3})+(?:,\d{2})?\s*(?:reais)?\b/gi,
  /\b\d+(?:[,.]\d+)?\s*(?:milh(?:ão|ões)|mil\b(?!\s*(?:metros|m²|km)))/gi,
];

export function contemValor(texto: string): boolean {
  return PADROES_DE_VALOR.some((p) => {
    p.lastIndex = 0;
    return p.test(texto);
  });
}

/**
 * O que dizer no lugar do número.
 *
 * Não é evasiva: é a resposta que um corretor bom dá. Preço sem contexto de
 * entrada, prazo e forma de pagamento não ajuda ninguém a decidir — e é
 * justamente essa conversa que leva à visita.
 */
const DESVIOS = [
  "Os valores variam conforme a unidade, o andar e a forma de pagamento — prefiro te passar a condição certa para o seu caso.",
  "O valor depende da unidade e das condições de entrada. Consigo levantar isso certinho para você.",
  "Cada unidade tem uma condição diferente. Deixa eu confirmar a que faz sentido para você.",
];

/**
 * Tira valores do texto que vai para o cliente.
 *
 * A frase inteira que contém o número é substituída, não só o número: um
 * texto como "sai por R$ 1.200.000" viraria "sai por" — pior que a versão
 * original, porque parece defeito.
 */
export function removerValores(texto: string, semente = 0): { texto: string; removeu: boolean } {
  if (!contemValor(texto)) return { texto, removeu: false };

  const frases = texto.split(/(?<=[.!?])\s+/);
  const limpas = frases.filter((f) => !contemValor(f));

  const desvio = DESVIOS[semente % DESVIOS.length];

  // Se sobrou conversa, o desvio entra no lugar da frase removida. Se o
  // texto INTEIRO era sobre preço, o desvio vira a resposta.
  const resultado = limpas.length > 0 ? `${limpas.join(" ")} ${desvio}` : desvio;

  return { texto: resultado.trim(), removeu: true };
}
