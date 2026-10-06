import type { EstagioDeCompra } from "@/lib/estagioDeCompra";

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
 * valores precisam continuar idênticos ao `check` da migration 0165.
 */
export const ETAPAS_FUNIL = [
  "novo",
  "primeiro_contato",
  "em_conversa",
  "qualificado",
  "visita_agendada",
  "visitou",
  "proposta",
  "documentacao",
  "fechado",
  "perdido",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

/**
 * O CAMINHO: as etapas que um negócio percorre, em ordem.
 *
 * "Perdido" fica de fora de propósito — não é um passo do caminho, é a saída
 * dele.
 */
export const ETAPAS_DO_CAMINHO = [
  "novo",
  "primeiro_contato",
  "em_conversa",
  "qualificado",
  "visita_agendada",
  "visitou",
  "proposta",
  "documentacao",
  "fechado",
] as const satisfies readonly EtapaFunil[];

/**
 * Funil completo × resumido (0165, 06/10/2026).
 *
 * O banco guarda UM funil, o completo. O resumido é só um jeito de olhar:
 * cada etapa pertence a um GRUPO, e o grupo é a coluna do funil resumido (as
 * seis colunas de antes). Relatórios e listas de transmissão contam sempre
 * pelas etapas reais, então os números de dois corretores batem qualquer
 * que seja o modo de tela de cada um.
 *
 * `primeiro_contato` guarda a chave antiga com o rótulo novo, "Mensagem
 * enviada": é o mesmo fato de antes (nós falamos, ele ainda não respondeu),
 * e trocar a chave mexeria em dezenas de consultas sem ganho.
 */
export const GRUPOS_FUNIL = ["novo", "contato", "visita", "negociacao", "fechado", "perdido"] as const;
export type GrupoFunil = (typeof GRUPOS_FUNIL)[number];

export const GRUPO_DA_ETAPA: Record<EtapaFunil, GrupoFunil> = {
  novo: "novo",
  primeiro_contato: "contato",
  em_conversa: "contato",
  qualificado: "contato",
  visita_agendada: "visita",
  visitou: "visita",
  proposta: "negociacao",
  documentacao: "negociacao",
  fechado: "fechado",
  perdido: "perdido",
};

export const GRUPO_LABEL: Record<GrupoFunil, string> = {
  novo: "Leads",
  contato: "Contatei",
  visita: "Visita",
  negociacao: "Documentação",
  fechado: "Fechado",
  perdido: "Perdido",
};

export function etapasDoGrupo(grupo: GrupoFunil): EtapaFunil[] {
  return ETAPAS_FUNIL.filter((e) => GRUPO_DA_ETAPA[e] === grupo);
}

/** Soma uma contagem por etapa em contagem por grupo (funil resumido). */
export function somarPorGrupo(porEtapa: Partial<Record<EtapaFunil, number>>): Record<GrupoFunil, number> {
  const total = Object.fromEntries(GRUPOS_FUNIL.map((g) => [g, 0])) as Record<GrupoFunil, number>;
  for (const e of ETAPAS_FUNIL) total[GRUPO_DA_ETAPA[e]] += porEtapa[e] ?? 0;
  return total;
}

/**
 * O lead já chegou em `alvo` (ou passou dele)? Perdido nunca chegou em nada:
 * a etapa atual dele não diz até onde ele foi.
 */
export function chegouEm(etapa: EtapaFunil, alvo: EtapaFunil): boolean {
  if (etapa === "perdido") return alvo === "perdido";
  return ETAPAS_FUNIL.indexOf(etapa) >= ETAPAS_FUNIL.indexOf(alvo);
}

/** Etapas em que a visita já foi marcada (ou passou dela), sem perdido. */
export const ETAPAS_DE_VISITA_EM_DIANTE: readonly EtapaFunil[] = ETAPAS_DO_CAMINHO.filter((e) =>
  chegouEm(e, "visita_agendada"),
);

export const ETAPA_LABEL: Record<EtapaFunil, string> = {
  novo: "Leads",
  primeiro_contato: "Mensagem enviada",
  em_conversa: "Em conversa",
  qualificado: "Qualificado",
  visita_agendada: "Visita marcada",
  visitou: "Visitou",
  proposta: "Proposta",
  documentacao: "Documentação",
  fechado: "Fechado",
  perdido: "Perdido",
};

/**
 * O que o botão de um toque faz em cada etapa.
 *
 * O rótulo é o ATO, não o destino. As etapas que a IA move sozinha
 * (mensagem enviada → em conversa → qualificado) também têm botão: o
 * corretor que atende pelo próprio celular faz o mesmo trabalho.
 *
 * `null` encerra o caminho.
 */
export const PROXIMA_ETAPA: Record<EtapaFunil, { etapa: EtapaFunil; acao: string } | null> = {
  novo: { etapa: "primeiro_contato", acao: "Mandei mensagem" },
  primeiro_contato: { etapa: "em_conversa", acao: "Ele respondeu" },
  em_conversa: { etapa: "qualificado", acao: "Qualifiquei" },
  qualificado: { etapa: "visita_agendada", acao: "Marquei visita" },
  visita_agendada: { etapa: "visitou", acao: "Ele visitou" },
  visitou: { etapa: "proposta", acao: "Mandei proposta" },
  proposta: { etapa: "documentacao", acao: "Aceitou, documentação" },
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
  /**
   * Quantas vezes NÓS falamos desde a última fala dele (0060). Zera quando
   * ele responde — é o número que separa "insistimos e não deu" de "ele
   * conversa com a gente".
   */
  tentativasSemResposta: number;
  /**
   * O cliente pediu para NÃO ser mais procurado (0110).
   *
   * Separado de `etapa === "perdido"` de propósito: etapa anda e volta, e
   * bastaria alguém arrastar o cartão para "Novo" para o número de quem
   * pediu para sair voltar à lista de transmissão. Fato e permissão moram
   * em campos diferentes — a etapa é julgamento do funil, isto é um fato
   * dito pelo cliente.
   *
   * Não barra o CORRETOR: ele é uma pessoa decidindo, e às vezes é ele
   * quem reabre. Barra o que fala por iniciativa nossa.
   */
  naoContatarEm: string | null;
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
  /**
   * Chave na mão agora (`pronto`) ou obra por vir (`obra`) — os dois grupos
   * de `estagioDeCompra.ts`. É o eixo que as duas portas da home usam, e o
   * filtro existe para que o link delas seja de verdade.
   */
  estagio?: EstagioDeCompra;
};
