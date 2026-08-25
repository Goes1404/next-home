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
  id?: string;
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
  /** Id da linha em `midias` — presente quando veio do banco; ausente em placeholders. */
  id?: string;
  tipo: TipoMidia;
  url: string;
  alt: string;
  largura: number;
  altura: number;
  /** Data URL minúscula para o `placeholder="blur"` do next/image. */
  blurDataUrl: string | null;
};

export type FundoTipo = "video" | "foto";

export type Corretor = {
  nome: string;
  creci: string;
  whatsapp: string;
  fotoUrl: string | null;
  videoUrl: string | null;
  fundoTipo: FundoTipo;
  fundoFotoUrl: string | null;
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
 * Eram SETE até a 0045, e duas delas — "proposta enviada" e "em negociação" —
 * tinham um lead cada em produção contra 42 em "novo": a distinção existia no
 * schema e não na operação, e cobrava do corretor uma escolha a cada mexida.
 * Viraram "documentação".
 *
 * "Fechado" e "Perdido" continuam separados — somar venda e derrota numa
 * coluna só tornaria qualquer contagem inútil.
 *
 * A ordem desta lista é a ordem das colunas: mudar aqui muda a tela. Os
 * valores precisam continuar idênticos ao `check` da migration 0045.
 */
export const ETAPAS_FUNIL = [
  "novo",
  "primeiro_contato",
  "visita_agendada",
  "documentacao",
  "fechado",
  "perdido",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

/**
 * O CAMINHO: as cinco etapas que um negócio percorre, em ordem.
 *
 * "Perdido" fica de fora de propósito — não é um passo do caminho, é a saída
 * dele. Ficava ocupando uma coluna no quadro e um chip na lista como se
 * fosse destino, quando o que o corretor faz com um lead perdido é tirá-lo
 * da frente. Continua existindo (seis leads reais estavam nele), agora como
 * ação secundária.
 */
export const ETAPAS_DO_CAMINHO = [
  "novo",
  "primeiro_contato",
  "visita_agendada",
  "documentacao",
  "fechado",
] as const satisfies readonly EtapaFunil[];

export const ETAPA_LABEL: Record<EtapaFunil, string> = {
  novo: "Leads",
  primeiro_contato: "Contatei",
  visita_agendada: "Visita",
  documentacao: "Documentação",
  fechado: "Fechado",
  perdido: "Perdido",
};

/**
 * O que o botão de um toque faz em cada etapa.
 *
 * O rótulo é o ATO, não o destino: "Contatei" (já falei com ele) em vez de
 * "mover para Primeiro contato". O corretor não pensa em mover cartão, ele
 * pensa no que acabou de fazer — e é isso que o botão registra.
 *
 * `null` encerra o caminho: quem fechou ou perdeu não avança para lugar
 * nenhum, e um botão ali só seria armadilha.
 */
export const PROXIMA_ETAPA: Record<EtapaFunil, { etapa: EtapaFunil; acao: string } | null> = {
  novo: { etapa: "primeiro_contato", acao: "Falei com ele" },
  primeiro_contato: { etapa: "visita_agendada", acao: "Marquei visita" },
  visita_agendada: { etapa: "documentacao", acao: "Visitou, seguiu" },
  documentacao: { etapa: "fechado", acao: "Fechou negócio" },
  fechado: null,
  perdido: null,
};

/** Como o lead ganhou dono — o que permite auditar a roleta. */
export type OrigemAtribuicao = "link" | "roleta" | "manual";

export const ORIGEM_ATRIBUICAO_LABEL: Record<OrigemAtribuicao, string> = {
  link: "Link pessoal",
  roleta: "Distribuição automática",
  manual: "Atribuído pelo gestor",
};

/** Modelo de mensagem que o corretor reutiliza no disparo em massa. */
export type TemplateMensagem = {
  id: string;
  titulo: string;
  conteudo: string;
  padrao: boolean;
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
  portalOrigem?: string | null;
  anuncioOrigem?: string | null;
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
  id?: string;
  slug: string;
  nome: string;
  /**
   * Como o CLIENTE chama este imóvel: nome comercial, apelido de anúncio.
   *
   * Medido em conversa real: "Gostaria de informações do Dom parque" para um
   * cadastro chamado "Lançamento ao Lado do Parque", e "manacá Barueri" para
   * "More na Aldeia de Barueri". Sem isto o bot trata o imóvel como se fosse
   * de outra imobiliária (ver `focoDaConversa.ts`).
   */
  nomesAlternativos?: string[];
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
  publicado?: boolean;
  /** Link do Book Digital completo (PDF / Apresentação) */
  bookUrl?: string | null;
  bookTitulo?: string | null;
  lat: number | null;
  lng: number | null;
  /** ISO — alimenta o selo "novo" e a ordenação por mais recentes. */
  criadoEm: string;
  capa: Midia;
  /** Todas as mídias associadas (fotos, plantas, vídeos) */
  midias?: Midia[];
  /** Somente `tipo = 'foto'`: é o que a galeria mostra. */
  galeria: Midia[];
  /** Plantas do empreendimento como um todo (as por tipologia ficam em `Tipologia.plantaUrl`). */
  plantas: Midia[];
  /** `url` é o link do YouTube/Vimeo (ou de um mp4 direto) — nunca arquivo bruto de 360°. */
  videos: Midia[];
  /** `url` é a página do tour hospedada por terceiro (construtora, Matterport, Kuula...), incorporada via iframe. */
  tours360: Midia[];
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
  /** Busca livre por nome — inclui os nomes alternativos ("Dom Parque"). */
  busca?: string;
  tipo?: TipoImovel;
  cidade?: string;
  bairro?: string;
  /** Preço "a partir de" não pode passar deste teto. */
  precoMax?: number;
  /** A tipologia mais compacta do empreendimento tem pelo menos isso de dormitórios. */
  dormitoriosMin?: number;
};
