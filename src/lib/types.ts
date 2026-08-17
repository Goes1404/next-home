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
export type TipoMidia = "foto" | "planta" | "video" | "tour360";

export const STATUS_LABEL: Record<StatusObra, string> = {
  breve_lancamento: "Breve lançamento",
  pre_lancamento: "Pré-lançamento",
  lancamento: "Lançamento",
  em_construcao: "Em construção",
  ultimas_unidades: "Últimas unidades",
  pronto_para_morar: "Pronto para morar",
};

export const TIPO_LABEL: Record<TipoImovel, string> = {
  apartamento: "Apartamento",
  alto_padrao: "Alto padrão",
  casa: "Casa",
  terreno: "Terreno",
};

export type Tipologia = {
  nome: string;
  areaPrivativa: number | null;
  dormitorios: number;
  suites: number;
  banheiros: number;
  vagas: number;
  preco: number | null;
  plantaUrl: string | null;
  /** Null = não informado. A UI omite o aviso de disponibilidade nesse caso. */
  unidadesDisponiveis: number | null;
};

export type Midia = {
  tipo: TipoMidia;
  url: string;
  alt: string;
  largura: number;
  altura: number;
  /** Data URL minúscula para o `placeholder="blur"` do next/image. */
  blurDataUrl: string | null;
};

export type Corretor = {
  nome: string;
  creci: string;
  whatsapp: string;
  fotoUrl: string | null;
};

/**
 * Corretor com identidade própria no site — tem página em `/corretores/<slug>`
 * e pode compartilhar o portfólio atribuído a si. O registro genérico "Equipe
 * Next Home" não tem `slug`, e por isso fica fora da vitrine da equipe.
 */
export type CorretorPerfil = Corretor & { id: string; slug: string };

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
  lat: number | null;
  lng: number | null;
  /** ISO — alimenta o selo "novo" e a ordenação por mais recentes. */
  criadoEm: string;
  capa: Midia;
  /** Somente `tipo = 'foto'`: é o que a galeria mostra. */
  galeria: Midia[];
  /** Plantas do empreendimento como um todo (as por tipologia ficam em `Tipologia.plantaUrl`). */
  plantas: Midia[];
  tipologias: Tipologia[];
  lazer: string[];
  corretor: Corretor;
};

export type Ordenacao = "destaque" | "preco_asc" | "preco_desc" | "recentes";

export const ORDENACAO_LABEL: Record<Ordenacao, string> = {
  destaque: "Destaques",
  preco_asc: "Menor preço",
  preco_desc: "Maior preço",
  recentes: "Mais recentes",
};

/** Filtros da listagem — cada campo em branco/undefined não filtra. */
export type FiltrosEmpreendimento = {
  tipo?: TipoImovel;
  cidade?: string;
  bairro?: string;
  /** Preço "a partir de" não pode passar deste teto. */
  precoMax?: number;
  /** A tipologia mais compacta do empreendimento tem pelo menos isso de dormitórios. */
  dormitoriosMin?: number;
};
