export type MatchStatus = "exato" | "sugerido" | "nao_encontrado";

export interface LinhaPlanilhaBruta {
  textoNome: string;
  textoPreco: string;
  precoNumerico: number | null;
}

export interface EmpreendimentoSimples {
  id: string;
  nome: string;
  slug: string;
  cidade: string;
  bairro: string;
  precoAtual: number | null;
}

export interface ItemConciliado {
  idTemp: string;
  linhaOriginal: LinhaPlanilhaBruta;
  empreendimentoId: string | null;
  nomeEmpreendimento: string | null;
  slugEmpreendimento: string | null;
  cidade: string | null;
  bairro: string | null;
  precoAtual: number | null;
  precoNovo: number;
  diferencaReais: number | null;
  variacaoPercentual: number | null;
  matchStatus: MatchStatus;
  scoreSimilaridade: number;
  selecionado: boolean;
}

export interface LoteHistorico {
  id: string;
  nomeLote: string;
  totalImoveis: number;
  status: "aplicado" | "revertido";
  criadoEm: string;
  revertidoEm: string | null;
  gestorNome?: string | null;
}
