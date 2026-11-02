// A prospecção da Astro (0253, 02/11/2026): tipos e constantes.
//
// Módulo PURO: nada de rede nem banco. A loja prospectada mora em
// `prospeccao_leads` (tabela global) e a configuração da amostra de site em
// `prospeccao_leads.amostra` (jsonb), lida por `renderizarAmostra`.

export const MODELOS = ["varejo", "servicos", "alimentacao", "crm"] as const;
export type Modelo = (typeof MODELOS)[number];

export const ROTULO_DO_MODELO: Record<Modelo, string> = {
  varejo: "Varejo",
  servicos: "Serviços com hora marcada",
  alimentacao: "Alimentação",
  crm: "CRM (imobiliárias e outros ramos)",
};

/** As etapas do funil, na ordem em que a loja anda. */
export const ETAPAS = ["novo", "aprovado", "enviado", "respondeu", "reuniao", "proposta", "ganho", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  novo: "Novo",
  aprovado: "Aprovado para envio",
  enviado: "Abordado",
  respondeu: "Respondeu",
  reuniao: "Reunião marcada",
  proposta: "Proposta enviada",
  ganho: "Fechou",
  perdido: "Perdido",
};

export function ehEtapa(valor: unknown): valor is Etapa {
  return typeof valor === "string" && (ETAPAS as readonly string[]).includes(valor);
}

export function ehModelo(valor: unknown): valor is Modelo {
  return typeof valor === "string" && (MODELOS as readonly string[]).includes(valor);
}

/** As ilustrações que a amostra sabe desenhar (`bottle()` do molde). */
export const FORMAS = [
  "tall", "round", "arab", "square", "tube", "jar", "lipstick", "gift", "tee", "nail",
  "cup", "bread", "cake", "plate", "scissors", "car",
] as const;
export type Forma = (typeof FORMAS)[number];

/** Os ícones das categorias (os círculos no estilo dos destaques do Instagram). */
export const ICONES = [
  "promo", "new", "perfume", "make", "skin", "hair", "nail", "kids", "gift", "moda", "svc", "moto", "box",
  "cafe", "pao", "agenda", "tesoura", "carro",
] as const;
export type Icone = (typeof ICONES)[number];

/** [forma, cor 1, cor 2, cor da tampa]. */
export type Ilustracao = [Forma, string, string, string];

export type ProdutoDaAmostra = {
  /** Nome. */
  n: string;
  /** Categoria. */
  c: string;
  /** Preço, já escrito ("39,90"). */
  p: string;
  /** Preço antigo, quando é promoção. */
  o?: string;
  b: Ilustracao;
  /** Fundo do cartão. */
  bg: string;
  /** Selo do cartão ("Novo", "-30%"). */
  t: string;
};

export type ModoDoPedido = "retire" | "entrega" | "encomenda" | "agenda";

/** O que a amostra resolve, no formato "hoje / com o site". */
export type ItemResolve = { hoje: string; titulo: string; texto: string };

export type FaixaDaAmostra = { titulo: string; texto: string; mockTitulo: string; mockTexto: string; botao: string };

/**
 * A configuração da amostra gravada no lead. Tudo é opcional: o que faltar
 * vem do padrão do modelo (`modelos.ts`).
 */
export type ConfigDaAmostra = {
  cores?: { primaria?: string; profunda?: string; tinta?: string };
  iniciais?: string;
  /** Rótulo curto embaixo do nome, no topo ("Barueri, Centro"). */
  local?: string;
  selo?: [string, string];
  titulo?: [string, string];
  chamada?: string;
  adesivos?: { a?: [string, string]; b?: [string, string] };
  categorias?: [string, Icone][];
  novidades?: ProdutoDaAmostra[];
  promocoes?: ProdutoDaAmostra[];
  vitrine?: { titulo?: string; texto?: string; aba1?: string; aba2?: string; cta?: string };
  modo?: ModoDoPedido;
  clube?: string;
  /** Serviços para agendar; `null` esconde a agenda. */
  servicos?: string[] | null;
  faixa?: FaixaDaAmostra | null;
  resolve?: ItemResolve[];
  /** Calculadora do clube; `null` esconde. */
  calculadora?: { clientes: number; ticket: number } | null;
  /** Sete linhas, de segunda a domingo; `null` esconde. */
  horario?: string[] | null;
  heroA?: [Forma, string, string, string, number][];
  heroB?: [Forma, string, string, string, number][];
};

/** O que `renderizarAmostra` precisa da linha de `prospeccao_leads`. */
export type LeadParaAmostra = {
  nome: string;
  slug: string;
  modelo: string;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  amostra: unknown;
};
