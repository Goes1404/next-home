/**
 * A sessão foi aberta por um link de acesso (convite ou recuperação), e há
 * pouco tempo?
 *
 * `/corretor/definir-senha` troca a senha SEM pedir a atual: quem foi
 * convidado nunca teve uma, e quem esqueceu não sabe qual é. Só que qualquer
 * sessão chegaria lá pela URL — inclusive uma sessão roubada, que trocaria a
 * senha sem conhecer a atual. A tela só vale para a sessão que o link acabou
 * de abrir; o resto vai para `/corretor/senha`, que pede a senha atual.
 *
 * Quem diz como a sessão nasceu é o claim `amr` do JWT: uma lista de
 * `{ method, timestamp }`. Medido no Auth local (19/10/2026): o `verifyOtp`
 * com `token_hash`, de convite ou de recuperação, grava `method: "otp"`.
 * `recovery`, `invite` e `magiclink` ficam na lista porque versões do GoTrue
 * já gravaram esses nomes; `password` (login comum) nunca vale.
 *
 * O `timestamp` é o do link, não o do token: renovar a sessão não o empurra
 * para frente, então os 15 minutos contam a partir do clique no botão.
 */

export const METODOS_DE_LINK: ReadonlySet<string> = new Set(["otp", "recovery", "invite", "magiclink"]);

/** Tempo para criar a senha depois de abrir o link (o mesmo do cookie do link). */
export const JANELA_DO_LINK_S = 15 * 60;

/** Relógio do servidor um pouco atrás do Auth não pode recusar o link recém-aberto. */
const FOLGA_DO_RELOGIO_S = 60;

type EntradaAmr = { method?: unknown; timestamp?: unknown };

export function sessaoAbertaPorLink(
  claims: { amr?: unknown } | null | undefined,
  // O relógio mora aqui, e não em quem chama: a tela é Server Component, e
  // `Date.now()` no corpo dela reprova no lint (react-hooks/purity).
  agoraS: number = Math.floor(Date.now() / 1000),
): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entrada: EntradaAmr) => {
    if (!entrada || typeof entrada.method !== "string" || typeof entrada.timestamp !== "number") return false;
    if (!METODOS_DE_LINK.has(entrada.method)) return false;
    const idade = agoraS - entrada.timestamp;
    return idade <= JANELA_DO_LINK_S && idade >= -FOLGA_DO_RELOGIO_S;
  });
}

/** Para onde vai quem chegou a `/corretor/definir-senha` sem a sessão do link. */
export const DESTINO_SEM_LINK = "/corretor/senha?link=vencido";
