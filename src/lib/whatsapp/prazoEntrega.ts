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

/**
 * MENÇÃO a entrega/prontidão. Sozinha não acusa nada — ver `afirmaPrazo`.
 * "Pronto para morar" é status do cadastro e fica de fora de propósito.
 */
const MENCOES_DE_ENTREGA: RegExp[] = [
  /\bentrega(r|m|rá|rão)?\b(?!\s+(digital|do\s+material))/i,
  /\bentregue\b/i,
  /\bfica(r[áa])?\s+pronto\b/i,
  /\bprevis[ãa]o\s+de\s+conclus[ãa]o\b/i,
  /\bchaves?\b/i,
  /\bobra\s+(termina|conclui|acaba)/i,
  /*
   * "prazo" sozinho é tão amplo quanto "entrega" era: "janeiro é um prazo
   * apertado para obra" avalia o prazo DO CLIENTE e não promete nada —
   * era acusado. Só conta quando o prazo é NOSSO de entregar.
   */
  /\bprazo\s+(de\s+entrega|da\s+obra|de\s+conclus)/i,
];

/**
 * O que transforma a menção em PROMESSA: uma referência de tempo.
 *
 * Sem isto o detector acusava qualquer aparição da palavra "entrega" — e
 * foi o que aconteceu em 26/08: o guardrail cortou "o Vitra é pronto para
 * morar, mas a entrega imediata depende da unidade", que é uma ressalva
 * honesta, e o eval registrou "inventou prazo". Pior: barrava também a
 * frase que a regra 23b MANDA dizer ("não tenho a data de entrega, eu
 * confirmo com você"), deixando a IA sem como ser honesta sobre o que não
 * sabe.
 */
const MARCADOR_DE_TEMPO =
  /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b20\d{2}\b|\b\d+\s*(dias?|semanas?|m[êe]s|meses|anos?)\b|\b(ano\s+que\s+vem|pr[óo]ximo\s+ano|fim\s+do\s+ano|final\s+do\s+ano|semestre|trimestre)\b|\b(em\s+)?breve\b|\bimediat[ao]\b|\blogo\b/i;

/**
 * O que DESARMA a acusação: a frase não está prometendo, está negando ou
 * dizendo que vai confirmar.
 *
 * É o oposto exato do defeito que o guardrail existe para cortar — e é o
 * comportamento que o prompt pede na regra 23b. Punir isso empurrava a IA
 * para o silêncio justamente onde a honestidade importa.
 */
const DESARME =
  /\bn[ãa]o\b|\bdepende\b|\bvaria\b|\bconfirm(o|ar|amos)\b|\bchec(o|ar)\b|\bverific(o|ar)\b|\bsem\s+data\b/i;

/**
 * A frase afirma um PRAZO de entrega?
 *
 * Exige as três condições juntas: falar de entrega, dar uma referência de
 * tempo, e não estar negando nem prometendo confirmar. Prazo é a promessa
 * mais cara deste negócio — o cliente rescinde aluguel contando com ela —,
 * mas acusar quem foi honesto custa a honestidade.
 */
export function afirmaPrazo(texto: string): boolean {
  if (!MENCOES_DE_ENTREGA.some((p) => p.test(texto))) return false;
  if (!MARCADOR_DE_TEMPO.test(texto)) return false;
  return !DESARME.test(texto);
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

/**
 * O bloco que entra no prompt quando NENHUM imóvel do catálogo tem data de
 * entrega cadastrada.
 *
 * Irmão de `blocoRendaPendente`, e pelo mesmo motivo: a regra 14 já proíbe
 * afirmar prazo fora da ficha, e o eval de 26/08 pegou "posso te mostrar
 * opções que entregam até o fim do ano" mesmo assim — instrução geral no
 * meio de outras 28 perde para a vontade de ser útil.
 *
 * A diferença em relação ao guardrail é o momento: `removerPrazoInventado`
 * corta DEPOIS, e a frase cortada deixa a resposta mais pobre (às vezes
 * some inteira). Avisar ANTES é o que evita a frase existir.
 *
 * Só aparece quando o catálogo do prompt está de fato sem nenhuma data —
 * havendo uma cadastrada, dizer "você não sabe" seria mentira, e apagaria
 * informação verdadeira.
 */
export function blocoSemPrazoCadastrado(): string {
  return [
    "PRAZO DE ENTREGA — VOCÊ NÃO TEM ESSA INFORMAÇÃO:",
    "NENHUM imóvel desta conversa tem data de entrega cadastrada. Você não sabe quando nada fica pronto, e não dá para deduzir pelo estágio da obra.",
    "PROIBIDO prometer prazo, mesmo vago: nada de \"entrega até o fim do ano\", \"fica pronto em alguns meses\", \"deve sair em breve\", \"dá tempo para janeiro\".",
    "O que você PODE dizer, e deve: o que está PRONTO para morar hoje (isso é status do cadastro, não data), que o prazo do que está em obra você confirma com a construtora, e que o prazo que ele pediu é apertado para obra — dizer isso é honesto e ajuda.",
  ].join("\n");
}
