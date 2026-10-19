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

export type LinkPendente = { tokenHash: string; tipo: TipoDeLink; next: string };

const TIPOS = new Set<string>(["invite", "recovery"]);

/**
 * Lê os parâmetros do link (query do e-mail ou valor do cookie). Link
 * incompleto ou de tipo desconhecido → `null`. O `next` já sai saneado.
 */
export function lerLinkPendente(parametros: URLSearchParams): LinkPendente | null {
  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type");
  if (!tokenHash || !tipo || !TIPOS.has(tipo)) return null;
  return { tokenHash, tipo: tipo as TipoDeLink, next: destinoSeguro(parametros.get("next")) };
}

/** O valor do cookie: os mesmos três parâmetros, com o `next` já saneado. */
export function valorDoCookie(link: LinkPendente): string {
  return new URLSearchParams({ token_hash: link.tokenHash, type: link.tipo, next: link.next }).toString();
}

export function lerCookieDoLink(valor: string | undefined): LinkPendente | null {
  if (!valor) return null;
  return lerLinkPendente(new URLSearchParams(valor));
}
