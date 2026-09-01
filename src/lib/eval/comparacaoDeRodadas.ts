/**
 * Comparar duas versões do prompt sem se enganar com ruído.
 *
 * ## O defeito de método que isto conserta
 *
 * Da v25 à v28 eu decidi quatro vezes com **4 personas e UMA rodada**, e
 * três dessas decisões foram erradas: a v26 "não mudou nada", a v27 parecia
 * ter consertado a repetição (3 → 0 na persona-alvo) e piorou o veredito do
 * juiz, e a v28 mudou a regra de negócio sem que o número se mexesse.
 *
 * A memória do projeto já registrava a causa, duas vezes, sobre outros
 * assuntos: **uma medição não distingue efeito de variância**. Três rodadas
 * quase iguais da v17 deram 2, 4 e 1 falhas duras; três da v23 deram 2, 2 e
 * 2 mas em CASOS diferentes. Mesmo assim segui decidindo com n=1, porque não
 * havia ferramenta que tornasse o contrário barato. É essa a ferramenta.
 *
 * ## A régua: faixas que não se tocam
 *
 * Com três rodadas não há teste estatístico honesto — n é pequeno demais, e
 * fingir um p-valor aqui seria pior que não ter nenhum. A régua é a mais
 * conservadora possível e dá para explicar em uma frase:
 *
 * > A diferença só conta quando a PIOR rodada da versão melhor ainda ganha
 * > da MELHOR rodada da versão pior.
 *
 * Faixas que se sobrepõem = empate, mesmo que as medianas diferam. É um
 * critério que erra para o lado de "não mexa" — e esse é o lado certo:
 * quatro versões seguidas foram publicadas como avanço sem serem avanço.
 */

export type Direcao = "menor" | "maior";

export interface Metrica {
  chave: string;
  rotulo: string;
  melhorQuando: Direcao;
  /** Vem do juiz LLM? Sem juiz independente, não decide sozinha. */
  doJuiz?: boolean;
}

/**
 * O que se compara.
 *
 * As determinísticas vêm primeiro de propósito: são as que não dependem da
 * opinião de um modelo, e por isso as únicas que sustentam decisão quando o
 * juiz roda no mesmo provedor do agente — o caso de hoje.
 */
export const METRICAS: Metrica[] = [
  {
    chave: "clienteRepetiu",
    rotulo: "o cliente teve de repetir",
    melhorQuando: "menor",
  },
  { chave: "iaRepetiu", rotulo: "a IA repetiu pergunta", melhorQuando: "menor" },
  { chave: "respostasRepetidas", rotulo: "respostas quase idênticas", melhorQuando: "menor" },
  {
    chave: "maiorSequenciaSemNovidade",
    rotulo: "turnos seguidos sem assunto novo",
    melhorQuando: "menor",
  },
  { chave: "avancou", rotulo: "avançou (juiz)", melhorQuando: "maior", doJuiz: true },
  { chave: "assumiria", rotulo: "assumiria a conversa (juiz)", melhorQuando: "maior", doJuiz: true },
  { chave: "mesmaPessoa", rotulo: "soa a mesma pessoa (juiz)", melhorQuando: "maior", doJuiz: true },
];

/** Uma rodada: o valor agregado de cada métrica sobre as personas daquela rodada. */
export type Rodada = Record<string, number>;

export type Veredito = "melhorou" | "piorou" | "empate" | "sem_dados";

export interface ComparacaoDeMetrica {
  metrica: Metrica;
  antes: number[];
  depois: number[];
  veredito: Veredito;
  /** Só quando as faixas não se tocam — senão a diferença não é afirmável. */
  diferenca: number | null;
}

function faixa(valores: readonly number[]): { min: number; max: number } | null {
  if (valores.length === 0) return null;
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * O veredito de uma métrica.
 *
 * Exige pelo menos DUAS rodadas de cada lado: com uma só não existe faixa,
 * e comparar dois pontos é exatamente o erro que este módulo veio impedir.
 */
export function compararMetrica(
  metrica: Metrica,
  antes: readonly number[],
  depois: readonly number[],
): ComparacaoDeMetrica {
  const base = { metrica, antes: [...antes], depois: [...depois] };

  const fa = faixa(antes);
  const fd = faixa(depois);
  if (!fa || !fd || antes.length < 2 || depois.length < 2) {
    return { ...base, veredito: "sem_dados", diferenca: null };
  }

  const melhorouTudo =
    metrica.melhorQuando === "menor" ? fd.max < fa.min : fd.min > fa.max;
  const piorouTudo = metrica.melhorQuando === "menor" ? fd.min > fa.max : fd.max < fa.min;

  const md = mediana(depois)!;
  const ma = mediana(antes)!;

  if (melhorouTudo) return { ...base, veredito: "melhorou", diferenca: md - ma };
  if (piorouTudo) return { ...base, veredito: "piorou", diferenca: md - ma };
  return { ...base, veredito: "empate", diferenca: null };
}

export interface Comparacao {
  metricas: ComparacaoDeMetrica[];
  /** O juiz rodou em provedor independente nas DUAS versões? */
  juizDecide: boolean;
  /** O que se pode afirmar em uma frase. */
  conclusao: string;
}

/**
 * A conclusão em uma frase.
 *
 * Só as métricas determinísticas decidem quando o juiz não é independente.
 * Nota de juiz que roda no mesmo provedor do agente continua útil como
 * descrição — não como decisão, e a diferença precisa estar escrita, senão
 * alguém (eu) volta a usar "assumiria 1/4 → 0/4" como se fosse medida.
 */
export function compararRodadas(
  antes: readonly Rodada[],
  depois: readonly Rodada[],
  opcoes: { juizDecide: boolean },
): Comparacao {
  const metricas = METRICAS.map((m) =>
    compararMetrica(
      m,
      antes.map((r) => r[m.chave]).filter((v) => typeof v === "number"),
      depois.map((r) => r[m.chave]).filter((v) => typeof v === "number"),
    ),
  );

  const decisivas = metricas.filter((c) => !c.metrica.doJuiz || opcoes.juizDecide);
  const melhorou = decisivas.filter((c) => c.veredito === "melhorou");
  const piorou = decisivas.filter((c) => c.veredito === "piorou");

  let conclusao: string;
  if (decisivas.every((c) => c.veredito === "sem_dados")) {
    conclusao = "Rodadas de menos para comparar: são necessárias 2+ de cada versão.";
  } else if (melhorou.length === 0 && piorou.length === 0) {
    conclusao =
      "EMPATE — nenhuma métrica saiu da faixa de variância. A mudança não é um avanço demonstrável.";
  } else if (piorou.length === 0) {
    conclusao = `AVANÇO em ${melhorou.length} métrica(s): ${melhorou.map((c) => c.metrica.rotulo).join(", ")}. Nenhuma piorou.`;
  } else if (melhorou.length === 0) {
    conclusao = `REGRESSÃO em ${piorou.length} métrica(s): ${piorou.map((c) => c.metrica.rotulo).join(", ")}.`;
  } else {
    conclusao =
      `TROCA: melhorou ${melhorou.map((c) => c.metrica.rotulo).join(", ")} e ` +
      `piorou ${piorou.map((c) => c.metrica.rotulo).join(", ")}. Decisão de produto, não de número.`;
  }

  return { metricas, juizDecide: opcoes.juizDecide, conclusao };
}
