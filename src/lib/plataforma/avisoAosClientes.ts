// Os avisos da Astro para todos os clientes (0242, 29/10/2026).
//
// Pedido do dono: um recado da plataforma no painel de TODO cliente —
// novidade, manutenção programada, algo importante —, escrito em
// `/plataforma/avisos` e mostrado numa faixa fina abaixo do cabeçalho.
//
// Módulo PURO: o formulário da plataforma (navegador, prévia ao vivo), a
// action (servidor) e a leitura do painel usam as MESMAS regras daqui — a
// validação, quem vê (público por papel) e a situação (no ar, agendado,
// encerrado). As regras de banco da 0242 repetem os limites; mudou um,
// muda o outro.

export const TIPOS_DE_AVISO = ["novidade", "manutencao", "importante"] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

export const ROTULO_DO_TIPO: Record<TipoDeAviso, string> = {
  novidade: "Novidade",
  manutencao: "Manutenção",
  importante: "Importante",
};

export const PUBLICOS_DO_AVISO = ["todos", "gestores"] as const;
export type PublicoDoAviso = (typeof PUBLICOS_DO_AVISO)[number];

export const ROTULO_DO_PUBLICO: Record<PublicoDoAviso, string> = {
  todos: "Todos (corretores e gestores)",
  gestores: "Só gestores",
};

export const TITULO_MINIMO = 3;
export const TITULO_MAXIMO = 80;
export const TEXTO_MINIMO = 3;
export const TEXTO_MAXIMO = 400;
export const LINK_MAXIMO = 300;

/** O que o painel precisa para desenhar a faixa. */
export type AvisoAosClientes = {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoDeAviso;
  link: string | null;
  publico: PublicoDoAviso;
  inicio_em: string;
  fim_em: string | null;
  encerrado_em: string | null;
};

export function ehTipoDeAviso(v: unknown): v is TipoDeAviso {
  return typeof v === "string" && (TIPOS_DE_AVISO as readonly string[]).includes(v);
}

export function ehPublicoDoAviso(v: unknown): v is PublicoDoAviso {
  return typeof v === "string" && (PUBLICOS_DO_AVISO as readonly string[]).includes(v);
}

/**
 * O link do "Saiba mais": caminho do próprio site (`/corretor/...`) ou
 * endereço https. Recusa `//host` (outro site disfarçado de caminho), barra
 * invertida (o navegador a trata como `/`), espaço e qualquer outro esquema
 * (`javascript:`, `http:`). Mesma régua do check da 0242.
 */
export function linkDoAvisoValido(link: string): boolean {
  if (link.length === 0 || link.length > LINK_MAXIMO) return false;
  if (/[\s\\]/.test(link)) return false;
  if (link.startsWith("/")) return !link.startsWith("//");
  if (!link.startsWith("https://")) return false;
  try {
    const url = new URL(link);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** O link abre em outra aba? Só o externo; caminho do painel abre no lugar. */
export function linkExterno(link: string): boolean {
  return link.startsWith("https://");
}

/**
 * `datetime-local` do formulário ("2026-10-30T08:00") como instante de
 * Brasília. O Brasil não tem horário de verão desde 2019: São Paulo é sempre
 * -03:00. Vazio devolve `null`; formato estranho, `undefined` (erro).
 */
export function instanteDeBrasilia(valor: string): string | null | undefined {
  const v = valor.trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const data = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(data.getTime()) ? undefined : data.toISOString();
}

export type AvisoValidado = {
  titulo: string;
  texto: string;
  tipo: TipoDeAviso;
  link: string | null;
  publico: PublicoDoAviso;
  /** `null` = agora (o padrão do banco). */
  inicio_em: string | null;
  fim_em: string | null;
};

export type ResultadoDaValidacao = { ok: true; aviso: AvisoValidado } | { ok: false; erro: string };

const umaLinha = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
/** O texto pode ter quebra de linha; só tira os espaços das pontas e o excesso de linhas vazias. */
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\n{3,}/g, "\n\n") : "");

/**
 * Valida o que veio do formulário. `agora` só serve para recusar um fim que
 * já passou (o aviso nasceria encerrado e ninguém o veria).
 */
export function validarAviso(
  entrada: {
    titulo?: unknown;
    texto?: unknown;
    tipo?: unknown;
    link?: unknown;
    publico?: unknown;
    inicio?: unknown;
    fim?: unknown;
  },
  agora: Date = new Date(),
): ResultadoDaValidacao {
  const titulo = umaLinha(entrada.titulo);
  if (titulo.length < TITULO_MINIMO || titulo.length > TITULO_MAXIMO) {
    return { ok: false, erro: `O título precisa ter de ${TITULO_MINIMO} a ${TITULO_MAXIMO} caracteres.` };
  }
  const corpo = texto(entrada.texto);
  if (corpo.length < TEXTO_MINIMO || corpo.length > TEXTO_MAXIMO) {
    return { ok: false, erro: `O texto precisa ter de ${TEXTO_MINIMO} a ${TEXTO_MAXIMO} caracteres.` };
  }
  const tipo = entrada.tipo;
  if (!ehTipoDeAviso(tipo)) return { ok: false, erro: "Escolha o tipo do aviso." };
  const publico = entrada.publico === undefined || entrada.publico === null || entrada.publico === "" ? "todos" : entrada.publico;
  if (!ehPublicoDoAviso(publico)) return { ok: false, erro: "Escolha para quem é o aviso." };

  const linkBruto = typeof entrada.link === "string" ? entrada.link.trim() : "";
  if (linkBruto && !linkDoAvisoValido(linkBruto)) {
    return { ok: false, erro: "O link precisa ser um caminho do painel (/corretor/...) ou um endereço https://." };
  }

  const inicio = instanteDeBrasilia(typeof entrada.inicio === "string" ? entrada.inicio : "");
  const fim = instanteDeBrasilia(typeof entrada.fim === "string" ? entrada.fim : "");
  if (inicio === undefined) return { ok: false, erro: "A data de início não é válida." };
  if (fim === undefined) return { ok: false, erro: "A data de fim não é válida." };
  if (fim !== null) {
    const comeca = inicio ? new Date(inicio) : agora;
    if (new Date(fim) <= agora) return { ok: false, erro: "O fim já passou: o aviso não apareceria para ninguém." };
    if (new Date(fim) <= comeca) return { ok: false, erro: "O fim precisa ser depois do início." };
  }

  return {
    ok: true,
    aviso: { titulo, texto: corpo, tipo, link: linkBruto || null, publico, inicio_em: inicio, fim_em: fim },
  };
}

export type SituacaoDoAviso = "no_ar" | "agendado" | "encerrado";

export const ROTULO_DA_SITUACAO: Record<SituacaoDoAviso, string> = {
  no_ar: "No ar",
  agendado: "Agendado",
  encerrado: "Encerrado",
};

/** No ar, agendado ou encerrado (à mão ou porque o fim passou). */
export function situacaoDoAviso(
  a: Pick<AvisoAosClientes, "inicio_em" | "fim_em" | "encerrado_em">,
  agora: Date = new Date(),
): SituacaoDoAviso {
  if (a.encerrado_em) return "encerrado";
  if (a.fim_em && new Date(a.fim_em) <= agora) return "encerrado";
  if (new Date(a.inicio_em) > agora) return "agendado";
  return "no_ar";
}

/**
 * O que ESTA pessoa vê agora: só os avisos no ar, e o "só gestores" só para
 * gestor. O independente é gestor do próprio grupo (papel `gestor`), então
 * também vê. Mais importantes primeiro; no mesmo tipo, o mais novo.
 */
export function avisosParaQuemVe<T extends AvisoAosClientes>(
  avisos: readonly T[],
  papel: "gestor" | "corretor",
  agora: Date = new Date(),
): T[] {
  const peso: Record<TipoDeAviso, number> = { importante: 0, manutencao: 1, novidade: 2 };
  return avisos
    .filter((a) => situacaoDoAviso(a, agora) === "no_ar")
    .filter((a) => a.publico === "todos" || papel === "gestor")
    .sort((a, b) => peso[a.tipo] - peso[b.tipo] || b.inicio_em.localeCompare(a.inicio_em));
}

/** Os avisos que a pessoa já fechou, guardados no navegador dela (lista de ids). */
export const CHAVE_DOS_AVISOS_FECHADOS = "astro:avisos-fechados";

/** Lê a lista guardada; qualquer lixo vira lista vazia. */
export function lerAvisosFechados(bruto: string | null): string[] {
  if (!bruto) return [];
  try {
    const v: unknown = JSON.parse(bruto);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-50) : [];
  } catch {
    return [];
  }
}
