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

/**
 * O clique veio de um toque de pessoa? (0174, 10/10/2026)
 *
 * Só o navegador não basta. Na semana de 03 a 09/10, além dos robôs que se
 * declaram (ClaudeBot, GPTBot, MJ12bot, 71% dos cliques do site), um robô
 * com navegador de computador comum pediu os quatro botões de cada um dos 39
 * imóveis: 39 cliques em cada intenção, nenhum lead. Para o filtro de
 * navegador ele era gente.
 *
 * No botão do SITE a pergunta é se a navegação saiu de uma página nossa por
 * um toque. O navegador conta isso sozinho nos cabeçalhos `Sec-Fetch-*`:
 * `Sec-Fetch-Site` diz de onde veio (same-origin = de uma página do site) e
 * `Sec-Fetch-User: ?1` diz que foi gesto da pessoa. Robô que acha o link no
 * HTML e o pede direto não manda os dois. Navegador antigo, sem `Sec-Fetch`,
 * vale pela página de origem (`Referer` do próprio site).
 *
 * No ANÚNCIO o link é aberto pelo navegador do Instagram ou do Facebook, sem
 * página nossa antes; ali vale o filtro de navegador, como antes.
 *
 * Errar aqui só muda a contagem: o link funciona igual para todo mundo.
 */
export function ehCliqueDePessoa(p: {
  userAgent: string | null;
  doSite: boolean;
  secFetchSite: string | null;
  secFetchUser: string | null;
  referer: string | null;
  /** O host que recebeu o clique (o mesmo das páginas do site). */
  host: string | null;
}): boolean {
  if (!ehClienteDePessoa(p.userAgent)) return false;
  if (!p.doSite) return true;
  const site = p.secFetchSite?.trim().toLowerCase();
  if (site) return (site === "same-origin" || site === "same-site") && p.secFetchUser?.trim() === "?1";
  return refererDoProprioSite(p.referer, p.host);
}

function semWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function refererDoProprioSite(referer: string | null, host: string | null): boolean {
  if (!referer || !host) return false;
  try {
    return semWww(new URL(referer).host) === semWww(host);
  } catch {
    return false;
  }
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
