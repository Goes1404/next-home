import type {
  EmpreendimentoSimples,
  ItemConciliado,
  LinhaPlanilhaBruta,
  MatchStatus,
} from "./types";

/**
 * Remove acentos, pontuação e palavras comuns (stopwords) para comparação limpa.
 */
export function normalizarNomeParaComparacao(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\b(residencial|edificio|ed|res|condominio|cond|lancamento|torre|fase|alphaville|barueri|sp)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula a similaridade entre duas strings (de 0 a 1).
 */
export function calcularSimilaridade(str1: string, str2: string): number {
  const s1 = normalizarNomeParaComparacao(str1);
  const s2 = normalizarNomeParaComparacao(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  // Comparação por bigramas (Dice Coefficient)
  const getBigramas = (s: string) => {
    const bigramas = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigramas.add(s.slice(i, i + 2));
    }
    return bigramas;
  };

  const b1 = getBigramas(s1);
  const b2 = getBigramas(s2);

  let intersecao = 0;
  b1.forEach((b) => {
    if (b2.has(b)) intersecao++;
  });

  return (2 * intersecao) / (b1.size + b2.size || 1);
}

/**
 * Concilia as linhas da planilha com o catálogo atual de empreendimentos.
 */
export function conciliarPlanilhaComCatalogo(
  linhasPlanilha: LinhaPlanilhaBruta[],
  catalogo: EmpreendimentoSimples[],
): ItemConciliado[] {
  return linhasPlanilha.map((linha, index) => {
    let melhorMatch: EmpreendimentoSimples | null = null;
    let maiorScore = 0;

    for (const emp of catalogo) {
      // 1. Checagem exata de nome ou slug
      if (
        emp.nome.toLowerCase() === linha.textoNome.toLowerCase() ||
        emp.slug.toLowerCase() === linha.textoNome.toLowerCase()
      ) {
        melhorMatch = emp;
        maiorScore = 1.0;
        break;
      }

      // 2. Checagem de similaridade
      const score = calcularSimilaridade(linha.textoNome, emp.nome);
      if (score > maiorScore) {
        maiorScore = score;
        melhorMatch = emp;
      }
    }

    let status: MatchStatus = "nao_encontrado";
    if (maiorScore >= 0.9) status = "exato";
    else if (maiorScore >= 0.5) status = "sugerido";

    const empFinal = status !== "nao_encontrado" ? melhorMatch : null;
    const precoAtual = empFinal?.precoAtual ?? null;
    const precoNovo = linha.precoNumerico || 0;

    let diferencaReais: number | null = null;
    let variacaoPercentual: number | null = null;

    if (precoAtual !== null && precoAtual > 0 && precoNovo > 0) {
      diferencaReais = precoNovo - precoAtual;
      variacaoPercentual = parseFloat((((precoNovo - precoAtual) / precoAtual) * 100).toFixed(2));
    }

    return {
      idTemp: `temp_${index}_${Date.now()}`,
      linhaOriginal: linha,
      empreendimentoId: empFinal?.id ?? null,
      nomeEmpreendimento: empFinal?.nome ?? null,
      slugEmpreendimento: empFinal?.slug ?? null,
      cidade: empFinal?.cidade ?? null,
      bairro: empFinal?.bairro ?? null,
      precoAtual,
      precoNovo,
      diferencaReais,
      variacaoPercentual,
      matchStatus: status,
      scoreSimilaridade: maiorScore,
      selecionado: status === "exato" || status === "sugerido",
    };
  });
}
