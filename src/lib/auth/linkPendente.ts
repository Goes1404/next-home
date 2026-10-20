import { destinoSeguro, type TipoDeLink } from "./links";

/**
 * O link de convite/recuperação entre o CLIQUE e o BOTÃO.
 *
 * ## Por que o link não abre a sessão sozinho
 *
 * Filtros de e-mail (Safe Links do Outlook/Microsoft 365, antivírus,
 * pré-visualizadores) abrem os links da mensagem ANTES da pessoa. Se o
 * `GET /auth/confirmar` gastasse o token, o primeiro clique de verdade cairia
 * em "este link já foi usado" — e para quem usa Microsoft 365 o convite nunca
 * funcionaria.
 *
 * Por isso o GET só GUARDA o link (cookie `httpOnly`, caminho `/auth`, 15
 * minutos) e manda para `/auth/continuar`, uma tela com um botão. O
 * `verifyOtp` só roda quando a pessoa aperta o botão (server action, POST),
 * que scanner nenhum faz.
 *
 * O token sai da URL antes de qualquer HTML: a tela `/auth/continuar` não
 * carrega o `token_hash` no endereço, então ele não vai para o histórico, para
 * o `Referer` nem para o Analytics da Vercel do layout raiz.
 */

export const COOKIE_DO_LINK = "nh_link_acesso";

/** Onde a tela do botão mora (e o caminho do cookie). */
export const CAMINHO_DO_BOTAO = "/auth/continuar";
export const CAMINHO_DO_COOKIE = "/auth";

/** Tempo para apertar o botão depois de abrir o link. */
export const VALIDADE_DO_COOKIE_S = 15 * 60;

export const DESTINO_DO_LINK_RUIM = "/corretor/entrar?link=expirado";

/**
 * `email`: para quem é o link, para a tela do botão dizer QUAL conta vai
 * abrir (útil quando o navegador já tem outra aberta). Vem da URL, que
 * qualquer um edita, então só vale como aviso: o botão confere, depois de
 * verificar o token, que a conta aberta é mesmo dela, e senão fecha a sessão.
 * Link antigo, sem o parâmetro, continua valendo.
 */
export type LinkPendente = { tokenHash: string; tipo: TipoDeLink; next: string; email?: string };

const TIPOS = new Set<string>(["invite", "recovery"]);

const FORMATO_DE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{1,63}$/;

/**
 * Lê os parâmetros do link (query do e-mail ou valor do cookie). Link
 * incompleto ou de tipo desconhecido → `null`. O `next` já sai saneado; o
 * `email` sai em minúsculas, ou fora se não parecer e-mail.
 */
export function lerLinkPendente(parametros: URLSearchParams): LinkPendente | null {
  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type");
  if (!tokenHash || !tipo || !TIPOS.has(tipo)) return null;
  const link: LinkPendente = { tokenHash, tipo: tipo as TipoDeLink, next: destinoSeguro(parametros.get("next")) };
  const email = parametros.get("email")?.trim().toLowerCase();
  if (email && FORMATO_DE_EMAIL.test(email)) link.email = email;
  return link;
}

/** O valor do cookie: os mesmos parâmetros, com o `next` já saneado. */
export function valorDoCookie(link: LinkPendente): string {
  const parametros = new URLSearchParams({ token_hash: link.tokenHash, type: link.tipo, next: link.next });
  if (link.email) parametros.set("email", link.email);
  return parametros.toString();
}

/**
 * O `verifyOtp` falhou por um motivo que passa (rede, Auth fora do ar,
 * limite de pedidos), e não porque o link é ruim? Aí o token ainda não foi
 * gasto: o cookie fica e a pessoa tenta de novo no mesmo botão. Link vencido,
 * já usado ou inválido é 4xx do Auth (`otp_expired` e companhia): esse vai
 * para "pedir outro link".
 */
export function ehFalhaPassageiraDoAuth(erro: { status?: number; code?: string; name?: string }): boolean {
  if (erro.code === "otp_expired" || erro.code === "flow_state_expired") return false;
  if (erro.status === 429 || erro.code === "over_request_rate_limit") return true;
  if (typeof erro.status === "number" && erro.status >= 400 && erro.status < 500) return false;
  // 5xx, sem status (rede: AuthRetryableFetchError) ou status 0.
  return true;
}

export function lerCookieDoLink(valor: string | undefined): LinkPendente | null {
  if (!valor) return null;
  return lerLinkPendente(new URLSearchParams(valor));
}
