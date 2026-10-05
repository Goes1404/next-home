import { createHash } from "node:crypto";

/**
 * Medição do link do anúncio (0159, 05/10/2026).
 *
 * Funções puras: o resumo que conta pessoas sem identificá-las, o filtro de
 * robô (o mesmo da `reivindicar_clique_do_link`, 0143) e a pergunta "a
 * mensagem citou o imóvel do anúncio?", feita no texto que chega e nunca
 * gravada.
 */

/** O mesmo padrão de robô da 0143. Divergir faria a tela contar quem o porteiro descarta. */
export const PADRAO_ROBO = /(facebookexternalhit|facebot|meta-external|bot|crawl|spider|preview)/i;

export function ehClienteDePessoa(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent) && !PADRAO_ROBO.test(userAgent as string);
}

function resumo(partes: string[], segredo: string): string {
  return createHash("sha256").update([segredo, ...partes].join("|")).digest("hex").slice(0, 24);
}

/**
 * Uma "pessoa" no link: IP + navegador + dia, com segredo do servidor.
 *
 * O dia entra de propósito: o resumo muda toda noite, então serve para
 * contar quem clicou hoje, não para seguir alguém pela semana. Sem IP e sem
 * navegador não há o que resumir, e o clique fica sem pessoa (conta como
 * clique, não como pessoa).
 */
export function visitanteDoClique(p: {
  ip: string | null;
  userAgent: string | null;
  dia: string;
  segredo: string;
}): string | null {
  if (!p.ip || !p.userAgent) return null;
  return resumo(["visitante", p.ip.trim(), p.userAgent.trim(), p.dia], p.segredo);
}

/** O primeiro IP do `x-forwarded-for` é o do visitante; os seguintes são proxies. */
export function ipDaRequisicao(headers: Headers): string | null {
  const encaminhado = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || headers.get("x-real-ip")?.trim() || null;
}

/** O número de quem escreveu, resumido: conta pessoas distintas sem guardar o telefone. */
export function remetenteResumido(telefoneDigitos: string, segredo: string): string {
  return resumo(["remetente", telefoneDigitos.replace(/\D/g, "")], segredo);
}

function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/**
 * A mensagem cita o imóvel do anúncio?
 *
 * Casa o nome inteiro ou um apelido inteiro, como palavra (" dom parque "
 * não casa dentro de "domparquet"). Termo com menos de 4 letras não conta:
 * nome curto casaria por acaso numa conversa pessoal. Serve para decidir
 * depois se vale aceitar a mensagem que cita o imóvel; o erro aqui só muda
 * uma contagem.
 */
export function citaOImovel(texto: string | null | undefined, nomes: Array<string | null | undefined>): boolean {
  if (!texto?.trim()) return false;
  const alvo = normalizar(texto);
  return nomes.some((nome) => {
    if (!nome) return false;
    const termo = normalizar(nome).trim();
    if (termo.replace(/ /g, "").length < 4) return false;
    return alvo.includes(` ${termo} `);
  });
}

/** O dia de São Paulo (YYYY-MM-DD). Em UTC, das 21h à meia-noite já seria amanhã. */
export function diaEmSaoPauloISO(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/**
 * O segredo dos resumos: a chave de serviço, que só existe no servidor e
 * nunca vai ao navegador. Sem ela (máquina local sem .env) os resumos ainda
 * contam, só deixam de ser protegidos por segredo.
 */
export function segredoDaMedicao(): string {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
}
