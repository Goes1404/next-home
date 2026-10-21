import "server-only";

import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";
import { enderecoDoPainel } from "@/lib/marcaDoCrm/marca";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Os links de convite e de recuperação de senha.
 *
 * ## Por que o link é do nosso domínio, e não o `action_link` do Supabase
 *
 * O `action_link` passa pelo `/auth/v1/verify` do Supabase e devolve o token
 * no FRAGMENTO (`#access_token=...`), que nunca chega ao servidor. E o fluxo
 * PKCE do `@supabase/ssr` guarda o verificador num cookie do navegador que
 * PEDIU o link: o gestor pede o convite no computador dele, o corretor abre
 * o e-mail no celular, e não há verificador nenhum ali.
 *
 * O caminho que não depende de nada disso é o `hashed_token` na query de uma
 * rota nossa (`/auth/confirmar`). Ela não gasta o token (scanners de e-mail
 * abrem o link antes da pessoa): guarda o link e mostra um botão em
 * `/auth/continuar`, cuja action chama `verifyOtp({ type, token_hash })` no
 * servidor e grava os cookies da sessão na própria resposta
 * (`linkPendente.ts`).
 *
 * `generateLink` só GERA: não manda e-mail nenhum (o envio é do
 * `emailsDeAcesso.ts`, pelo Resend). Para o convite ele também cria o
 * usuário no Auth — quem chama continua responsável por desfazer se o
 * vínculo com a ficha falhar.
 */

export type TipoDeLink = "invite" | "recovery";

export type LinkDeAcesso =
  | { ok: true; url: string; userId: string }
  | { ok: false; motivo: "email_em_uso" | "email_de_acesso" | "falha" };

/** A rota que recebe o link (`src/app/auth/confirmar/route.ts`); o token só é gasto no botão de `/auth/continuar`. */
export const CAMINHO_DE_CONFIRMACAO = "/auth/confirmar";

/** Para onde vai quem entrou sem um `next` válido. */
const DESTINO_PADRAO = "/corretor";

/** Base fictícia só para o `URL` resolver o caminho; nunca vira resposta. */
const BASE_DE_CONFERENCIA = "http://conferencia.invalid";

/** As duas áreas para onde um `next` pode levar, com fronteira explícita. */
function dentroDasAreas(caminho: string): boolean {
  return caminho.startsWith("/corretor/") || caminho === "/plataforma" || caminho.startsWith("/plataforma/");
}

/**
 * O `next` vem da URL, que qualquer um edita (o link do e-mail e o login,
 * que recebe o `next` do proxy). Só passa caminho relativo que, DEPOIS de
 * resolvido (`..`, barras invertidas, `//host`), continua no mesmo host e
 * dentro de `/corretor/` ou de `/plataforma`. Todo o resto vira `/corretor`:
 * link para fora do site seria um redirecionamento aberto com a nossa marca
 * em cima.
 *
 * `/plataforma` entrou na junção das frentes (Task 9): o administrador da
 * plataforma que cai no login volta para a área dele. Quem decide se ele PODE
 * abrir a área é a guarda da página, não este filtro.
 */
export function destinoSeguro(next: string | null | undefined): string {
  if (!next || !(next.startsWith("/corretor/") || next.startsWith("/plataforma"))) return DESTINO_PADRAO;
  let url: URL;
  try {
    url = new URL(next, BASE_DE_CONFERENCIA);
  } catch {
    return DESTINO_PADRAO;
  }
  if (url.origin !== BASE_DE_CONFERENCIA || !dentroDasAreas(url.pathname)) return DESTINO_PADRAO;
  return url.pathname + url.search;
}

/**
 * Gera o link de convite (`invite`) ou de recuperação (`recovery`) de um
 * e-mail. Nunca lança: falha do Auth vira `{ ok: false, motivo: 'falha' }`.
 *
 * Recusa o endereço de acesso antigo (`@nexthome.com`): o domínio é de
 * terceiro, e o link de entrada iria para a caixa de um estranho.
 */
export async function gerarLinkDeAcesso(
  tipo: TipoDeLink,
  email: string,
  next: string,
  grupoId: string,
): Promise<LinkDeAcesso> {
  if (ehEmailDeAcesso(email)) return { ok: false, motivo: "email_de_acesso" };

  // O link leva a pessoa ao painel do grupo dela: o da Next Home no grupo 1,
  // o endereço do CRM (`PAINEL_URL`) nos outros.
  const base = enderecoDoPainel(grupoId);
  // O `redirectTo` não é usado pelo nosso link (o `action_link` é
  // descartado), mas vai coerente: se um dia alguém usar o link do Supabase,
  // ele cai na mesma rota.
  const redirectTo = `${base}${CAMINHO_DE_CONFIRMACAO}?${new URLSearchParams({ next })}`;

  try {
    const { data, error } = await createServiceClient().auth.admin.generateLink({
      type: tipo,
      email,
      options: { redirectTo },
    });

    if (error) {
      const codigo = (error as { code?: string }).code;
      if (codigo === "email_exists" || /already (been )?registered/i.test(error.message ?? "")) {
        return { ok: false, motivo: "email_em_uso" };
      }
      console.error(`[links] generateLink(${tipo}) falhou: ${codigo ?? ""} ${error.message ?? ""}`);
      return { ok: false, motivo: "falha" };
    }

    const hashedToken = data?.properties?.hashed_token;
    const userId = data?.user?.id;
    if (!hashedToken || !userId) {
      console.error(`[links] generateLink(${tipo}) voltou sem token ou sem usuário`);
      return { ok: false, motivo: "falha" };
    }

    // O `email` só serve para a tela do botão dizer qual conta vai abrir
    // (`linkPendente.ts`); quem decide a conta é o token.
    const query = new URLSearchParams({ token_hash: hashedToken, type: tipo, next, email: email.toLowerCase() });
    return { ok: true, url: `${base}${CAMINHO_DE_CONFIRMACAO}?${query}`, userId };
  } catch (e) {
    console.error(`[links] generateLink(${tipo}) lançou: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, motivo: "falha" };
  }
}
