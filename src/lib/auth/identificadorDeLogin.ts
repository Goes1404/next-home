/**
 * O campo de login aceita e-mail OU nome de usuário (29/10/2026, pedido do
 * dono: "transforme meu login em eduardo.bezerra").
 *
 * Com "@" é e-mail e vai direto para o Auth. Sem "@" é nome de usuário: o
 * servidor o traduz no e-mail pela função `email_do_usuario` (0240), que lê o
 * `app_metadata.usuario`. A regra do nome é estreita de propósito (letras,
 * números, ponto, hífen e sublinhado, 3 a 40) para nada estranho chegar ao
 * banco — e um texto fora dela já responde "inválidos", sem consulta.
 */

export type IdentificadorDeLogin = { tipo: "email"; email: string } | { tipo: "usuario"; usuario: string } | null;

const NOME_DE_USUARIO = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export function lerIdentificadorDeLogin(texto: string): IdentificadorDeLogin {
  const limpo = texto.trim();
  if (!limpo) return null;
  if (limpo.includes("@")) return { tipo: "email", email: limpo };
  const usuario = limpo.toLowerCase();
  return NOME_DE_USUARIO.test(usuario) ? { tipo: "usuario", usuario } : null;
}
