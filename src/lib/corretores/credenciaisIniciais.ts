/**
 * A credencial que o gestor entrega ao corretor no primeiro acesso.
 *
 * Módulo PURO de propósito: a action de administração e a guarda de
 * `email.ts` precisam da mesma regra, e módulo com dependência de servidor
 * arrastado para o grafo errado já quebrou o build desta base duas vezes
 * (`limitesPdf.ts`, `pessoasTipos.ts`). Puro também é o que torna a regra
 * testável sem banco.
 *
 * As duas metades são previsíveis por decisão do usuário — nome e telefone
 * são conhecidos de quem convive com a equipe. O que fecha essa janela não é
 * a senha, é `deve_trocar_senha: true`: o login seguinte cai em
 * `/corretor/senha` antes de qualquer tela (ver `src/app/corretor/actions.ts`).
 */

/**
 * Domínio dos e-mails de acesso.
 *
 * ATENÇÃO: `nexthome.com` NÃO é da Next Home — resolve para 72.20.123.54,
 * de terceiro. Nenhum e-mail pode sair para cá, e é por isso que
 * `enviarEmail` recusa este domínio. Se um dia a empresa passar a controlar
 * um domínio de verdade, trocar aqui e a guarda continua valendo.
 */
export const DOMINIO_ACESSO = "nexthome.com";

/** Prefixo fixo da senha inicial. Público por construção: a força está nos dígitos. */
const PREFIXO_SENHA = "nexthome";

/** Quantos dígitos finais do WhatsApp entram na senha. */
const DIGITOS_DA_SENHA = 4;

/**
 * `graziele-santos` → `graziele-santos@nexthome.com`.
 *
 * Sai do SLUG, não do nome: `corretores.slug` já é UNIQUE no banco, então o
 * e-mail nasce único sem nenhuma lógica nova — e o Auth exige unicidade.
 * Derivar do telefone teria colidido: "Eduardo Cezar" e "Equipe Next Home"
 * compartilham o mesmo número.
 */
export function emailInicial(slug: string): string {
  const limpo = slug.trim().toLowerCase();
  if (!limpo) throw new Error("Corretor sem slug: o e-mail de acesso sai dele.");
  return `${limpo}@${DOMINIO_ACESSO}`;
}

/**
 * `5511975594931` → `nexthome4931`.
 *
 * LANÇA quando não há dígitos suficientes em vez de devolver algo curto: o
 * Auth recusaria a senha, e a recusa aconteceria no MEIO do lote — parte dos
 * corretores criada, parte não, sem ninguém saber onde parou.
 */
export function senhaInicial(whatsapp: string): string {
  const digitos = (whatsapp ?? "").replace(/\D/g, "");
  if (digitos.length < DIGITOS_DA_SENHA) {
    throw new Error(
      `WhatsApp "${whatsapp}" não tem ${DIGITOS_DA_SENHA} dígitos para montar a senha inicial.`,
    );
  }
  return PREFIXO_SENHA + digitos.slice(-DIGITOS_DA_SENHA);
}

/** O endereço é de acesso ao painel, não uma caixa que recebe mensagem. */
export function ehEmailDeAcesso(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DOMINIO_ACESSO}`);
}
