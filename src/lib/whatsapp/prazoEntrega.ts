import type { Empreendimento } from "@/lib/types";

/**
 * A IA não inventa prazo de entrega.
 *
 * Flagrado pelo eval: contra "meu contrato de aluguel vence mês que vem,
 * não dá pra esperar obra", a resposta ofereceu um imóvel EM CONSTRUÇÃO
 * dizendo que a "entrega estava prevista para breve" — e o cadastro não tem
 * data nenhuma. A regra 14 já proíbe afirmar prazo de entrega fora da
 * ficha; aconteceu mesmo assim, porque instrução de prompt é
 * probabilística.
 *
 * Prazo é a promessa mais cara que existe neste negócio: o cliente organiza
 * mudança, rescinde aluguel e conta com a data. Errar aqui não custa uma
 * visita perdida, custa a confiança inteira.
 *
 * O corte só age quando NENHUM imóvel do catálogo tem `entregaPrevista`
 * preenchida — aí qualquer afirmação de prazo é necessariamente inventada,
 * e a decisão é segura. Havendo alguma data cadastrada, não dá para
 * atribuir a frase ao imóvel certo sem adivinhar, e adivinhar aqui
 * apagaria informação verdadeira. Conservador de propósito: falso positivo
 * corta o que era certo.
 */

/** Afirmações de PRAZO. "Pronto para morar" é status, não data — fica de fora. */
const PADROES_DE_PRAZO: RegExp[] = [
  /\bentrega\b(?!\s+(digital|do\s+material))/i,
  /\bentregue\b/i,
  /\bfica\s+pronto\b/i,
  /\bficar[áa]\s+pronto\b/i,
  /\bprevis[ãa]o\s+de\s+conclus[ãa]o\b/i,
  /\bchaves?\s+(em|no|na|at[ée])\b/i,
  /\bobra\s+(termina|conclui|acaba)/i,
];

export function afirmaPrazo(texto: string): boolean {
  return PADROES_DE_PRAZO.some((p) => p.test(texto));
}

/** Algum imóvel do catálogo tem data de entrega cadastrada? */
export function catalogoTemPrazo(catalogo: Empreendimento[]): boolean {
  return catalogo.some((e) => Boolean(e.entregaPrevista));
}

/**
 * Tira as frases que prometem prazo quando o catálogo não tem data alguma.
 *
 * Corta a FRASE inteira, não só a data — mesma decisão de `semValores`:
 * remover só o número deixaria "a entrega está prevista para" e pareceria
 * defeito de software.
 */
export function removerPrazoInventado(
  texto: string,
  catalogo: Empreendimento[],
): { texto: string; removeu: boolean } {
  if (catalogoTemPrazo(catalogo)) return { texto, removeu: false };
  if (!afirmaPrazo(texto)) return { texto, removeu: false };

  const frases = texto.split(/(?<=[.!?])\s+|\s*---\s*/);
  const limpas = frases.filter((f) => f.trim() && !afirmaPrazo(f));

  if (limpas.length === 0) {
    return {
      texto: "Deixa eu confirmar o prazo certinho com a construtora e já te falo.",
      removeu: true,
    };
  }

  return { texto: limpas.join(" --- "), removeu: true };
}
