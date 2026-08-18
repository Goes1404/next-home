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
  videoUrl: string | null;
};

/**
 * Corretor com identidade própria no site — tem página em `/corretores/<slug>`
 * e pode compartilhar o portfólio atribuído a si. O registro genérico "Equipe
 * Next Home" não tem `slug`, e por isso fica fora da vitrine da equipe.
 */
export type CorretorPerfil = Corretor & {
  id: string;
  slug: string;
  /** Apresentação curta, escrita pelo próprio corretor no painel. */
  bio: string | null;
};

/**
 * Etapas do funil de vendas, na ordem em que o quadro as exibe.
 *
 * "Fechado" e "Perdido" são etapas separadas — somar venda e derrota numa
 * coluna só tornaria qualquer contagem inútil. No quadro elas dividem a
 * última coluna.
 *
 * A ordem desta lista é a ordem das colunas: mudar aqui muda a tela. Os
 * valores precisam continuar idênticos ao `check` da migration 0007.
 */
export const ETAPAS_FUNIL = [
  "novo",
  "primeiro_contato",
  "visita_agendada",
  "proposta_enviada",
  "negociacao",
  "fechado",
  "perdido",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

export const ETAPA_LABEL: Record<EtapaFunil, string> = {
  novo: "Novo lead",
  primeiro_contato: "Primeiro contato",
  visita_agendada: "Visita agendada",
  proposta_enviada: "Proposta enviada",
  negociacao: "Em negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};

/** Como o lead ganhou dono — o que permite auditar a roleta. */
export type OrigemAtribuicao = "link" | "roleta" | "manual";

export const ORIGEM_ATRIBUICAO_LABEL: Record<OrigemAtribuicao, string> = {
  link: "Link pessoal",
  roleta: "Distribuição automática",
  manual: "Atribuído pelo gestor",
};

/** Contato recebido pelos formulários do site, como o corretor o vê. */
export type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  /** "comprador" (quer comprar) ou "proprietario" (tem imóvel a ofertar). */
  tipo: string;
  /** Campos do imóvel ofertado — só nos leads de proprietário. */
  detalhes: Record<string, string> | null;
  origem: string | null;
  criadoEm: string;
  /** Etapa atual no funil. */
  etapa: EtapaFunil;
  /** Quando a etapa mudou pela última vez — base do "parado há N dias". */
  etapaAlteradaEm: string;
  origemAtribuicao: OrigemAtribuicao | null;
  /** Dono do lead. Só o gestor vê leads de outros — e leads sem dono. */
  corretor: { id: string; nome: string } | null;
  empreendimento: { nome: string; slug: string; endereco: string | null } | null;
  /** Data/hora marcada quando `etapa === "visita_agendada"`; null até o corretor definir. */
  visitaAgendadaEm: string | null;
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
