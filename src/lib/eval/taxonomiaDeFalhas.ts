/**
 * A taxonomia de falhas — o que conserta a ordem em que consertamos.
 *
 * ## O defeito de método
 *
 * Da v25 à v28 o ciclo foi sempre o mesmo: eu leio UMA transcrição, formo
 * uma hipótese, mudo uma regra do prompt, rodo 4 personas uma vez. Isso é
 * conserto por anedota — a falha que eu conserto é a que apareceu na
 * conversa que eu abri, não a que acontece mais.
 *
 * O caminho conhecido é outro, e tem nome: **error analysis**. Amostrar
 * traces, anotar em aberto o que deu errado (*open coding*), agrupar as
 * anotações numa taxonomia (*axial coding*) e **contar** a frequência de
 * cada categoria. A ordem de conserto sai da contagem, não da impressão.
 *
 * ## O que este módulo é, e o que não é
 *
 * É a metade determinística: agrupar, contar, ordenar e formatar. A parte
 * que exige leitura — anotar e categorizar — é feita por LLM em
 * `scripts/eval/analiseDeErros.ts` e auditada por humano. A divisão é a de
 * sempre nesta casa: a régua fica em função pura e testável; o julgamento
 * fica fora e carimbado.
 *
 * ## A guarda que importa
 *
 * Categoria sem DEFINIÇÃO e sem EXEMPLO não entra no relatório. Uma
 * taxonomia de rótulos vagos ("resposta ruim", "faltou empatia") volta a
 * ser opinião com aparência de dado — e o projeto já perdeu tempo cinco
 * vezes com critérios que mediam outra coisa que não o que prometiam.
 */

export interface Anotacao {
  /** De qual conversa veio — persona ou id da conversa real. */
  origem: string;
  /** Em que turno. */
  turno: number;
  /** O que deu errado, em texto livre (open coding). */
  nota: string;
  /** A categoria atribuída no axial coding. Vazio = ainda não categorizada. */
  categoria?: string;
}

export interface Categoria {
  nome: string;
  /** Quando aplicar e quando NÃO aplicar. Sem isto a categoria não entra. */
  definicao: string;
}

export interface LinhaDaTaxonomia {
  categoria: string;
  definicao: string;
  ocorrencias: number;
  /** Em quantas conversas distintas apareceu — é o que separa crônico de pontual. */
  conversas: number;
  /** Percentual das anotações categorizadas. */
  fatia: number;
  exemplos: string[];
}

/** Categoria sem definição ou sem nenhuma ocorrência não descreve nada. */
export function categoriaEhUtil(cat: Categoria, anotacoes: readonly Anotacao[]): boolean {
  if (!cat.definicao || cat.definicao.trim().length < 20) return false;
  return anotacoes.some((a) => a.categoria === cat.nome);
}

/**
 * A taxonomia contada e ordenada pelo que acontece MAIS.
 *
 * O desempate é por número de conversas distintas, não por total de
 * ocorrências: uma falha que aparece 8 vezes numa conversa só é um caso; a
 * que aparece 4 vezes em 4 conversas é um padrão. É a mesma lição que a
 * memória já registrou sobre a cascata de provedores — a unidade que
 * importa é a CONVERSA, não a mensagem.
 */
export function montarTaxonomia(
  anotacoes: readonly Anotacao[],
  categorias: readonly Categoria[],
): LinhaDaTaxonomia[] {
  const categorizadas = anotacoes.filter((a) => a.categoria);
  const total = categorizadas.length;

  return categorias
    .filter((c) => categoriaEhUtil(c, anotacoes))
    .map((c) => {
      const minhas = categorizadas.filter((a) => a.categoria === c.nome);
      return {
        categoria: c.nome,
        definicao: c.definicao,
        ocorrencias: minhas.length,
        conversas: new Set(minhas.map((a) => a.origem)).size,
        fatia: total > 0 ? Math.round((minhas.length / total) * 1000) / 10 : 0,
        exemplos: minhas.slice(0, 3).map((a) => `${a.origem} t${a.turno}: ${a.nota}`),
      };
    })
    .sort((a, b) => b.conversas - a.conversas || b.ocorrencias - a.ocorrencias);
}

/**
 * Quantas anotações ficaram de fora da taxonomia.
 *
 * Sobra grande é sinal de que a taxonomia não descreve os dados — e o
 * conserto é rever as categorias, nunca empurrar o resto para um balde
 * "outros", que é onde uma taxonomia vai morrer.
 */
export function naoCategorizadas(anotacoes: readonly Anotacao[]): Anotacao[] {
  return anotacoes.filter((a) => !a.categoria);
}

/** O relatório legível. Números sem exemplo não se auditam. */
export function relatorio(
  linhas: readonly LinhaDaTaxonomia[],
  sobra: readonly Anotacao[],
): string {
  if (linhas.length === 0) {
    return "Nenhuma categoria com definição e ocorrência. Rode a análise de novo.";
  }

  const partes = [
    "# Taxonomia de falhas",
    "",
    `${linhas.reduce((s, l) => s + l.ocorrencias, 0)} anotações categorizadas em ${linhas.length} categorias.`,
    "",
    "| # | categoria | conversas | ocorrências | fatia |",
    "|---|---|---|---|---|",
    ...linhas.map(
      (l, i) => `| ${i + 1} | ${l.categoria} | ${l.conversas} | ${l.ocorrencias} | ${l.fatia}% |`,
    ),
    "",
  ];

  for (const [i, l] of linhas.entries()) {
    partes.push(
      `## ${i + 1}. ${l.categoria} — ${l.conversas} conversa(s), ${l.ocorrencias} ocorrência(s)`,
      "",
      l.definicao,
      "",
      ...l.exemplos.map((e) => `- ${e}`),
      "",
    );
  }

  if (sobra.length > 0) {
    partes.push(
      `## Fora da taxonomia (${sobra.length})`,
      "",
      "Sobra grande significa que as categorias não descrevem os dados — reveja as categorias.",
      "",
      ...sobra.slice(0, 10).map((a) => `- ${a.origem} t${a.turno}: ${a.nota}`),
      "",
    );
  }

  return partes.join("\n");
}
