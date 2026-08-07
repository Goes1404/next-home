/**
 * Modelo de domínio dos empreendimentos.
 *
 * Espelha o schema planejado para o Supabase (Fase 2) para que trocar a
 * fonte de dados — de `src/lib/data/*` para consultas reais — não exija
 * tocar em nenhum componente de UI.
 */

export type StatusObra =
  | "breve_lancamento"
  | "pre_lancamento"
  | "lancamento"
  | "em_construcao"
  | "ultimas_unidades"
  | "pronto_para_morar";

export type TipoImovel = "apartamento" | "alto_padrao" | "casa" | "terreno";
export type Finalidade = "lancamento" | "venda";

export const STATUS_LABEL: Record<StatusObra, string> = {
  breve_lancamento: "Breve lançamento",
  pre_lancamento: "Pré-lançamento",
  lancamento: "Lançamento",
  em_construcao: "Em construção",
  ultimas_unidades: "Últimas unidades",
  pronto_para_morar: "Pronto para morar",
};

export type Tipologia = {
  nome: string;
  areaPrivativa: number | null;
  dormitorios: number;
  suites: number;
  banheiros: number;
  vagas: number;
  preco: number | null;
};

export type Midia = {
  url: string;
  alt: string;
  largura: number;
  altura: number;
};

export type Corretor = {
  nome: string;
  creci: string;
  whatsapp: string;
};

export type Empreendimento = {
  slug: string;
  nome: string;
  tagline: string;
  descricao: string;
  status: StatusObra;
  tipo: TipoImovel;
  finalidade: Finalidade;
  cidade: string;
  bairro: string;
  endereco: string;
  precoAPartir: number | null;
  iptu: number | null;
  condominioValor: number | null;
  construtora: string | null;
  totalUnidades: number | null;
  totalTorres: number | null;
  totalAndares: number | null;
  entregaPrevista: string | null;
  destaque: boolean;
  capa: Midia;
  galeria: Midia[];
  tipologias: Tipologia[];
  lazer: string[];
  corretor: Corretor;
};
