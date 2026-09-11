/**
 * Quais campos da ficha uma PESSOA editou.
 *
 * A IA preenche a ficha a partir da conversa (0110). Sem esta marca, a
 * primeira correção manual seria desfeita na mensagem seguinte — e é assim
 * que alguém para de corrigir a ficha, que foi o que a deixou vazia.
 *
 * Quem escreveu um valor é um FATO diferente do valor, e por isso mora em
 * campo próprio (`leads.campos_do_corretor`) em vez de ser adivinhado.
 *
 * A lista só CRESCE. Se o corretor apagar o que digitou, a intenção
 * continua sendo "eu cuido deste campo" — a IA voltar a escrever ali
 * porque ele ficou vazio seria a correção sendo desfeita com outra roupa.
 */

/** Colunas que a IA pode escrever e que, portanto, vale proteger. */
export const CAMPOS_PROTEGIVEIS = [
  "nome",
  "email",
  "renda_mensal",
  "orcamento_min",
  "orcamento_max",
  "regiao_interesse",
  "dormitorios_min",
] as const;

export type CampoProtegivel = (typeof CAMPOS_PROTEGIVEIS)[number];

/**
 * Junta o que já estava marcado com o que esta edição tocou.
 *
 * Recebe o valor CRU do jsonb (que pode vir como qualquer coisa: o banco
 * não garante forma, e a coluna é escrita por código nosso hoje mas será
 * lida por código futuro).
 */
export function marcarCamposDoCorretor(
  atual: unknown,
  editados: readonly string[],
): CampoProtegivel[] {
  const anteriores = Array.isArray(atual) ? atual.filter((c): c is string => typeof c === "string") : [];
  const validos = (c: string): c is CampoProtegivel =>
    (CAMPOS_PROTEGIVEIS as readonly string[]).includes(c);

  return [...new Set([...anteriores, ...editados])].filter(validos).sort();
}
