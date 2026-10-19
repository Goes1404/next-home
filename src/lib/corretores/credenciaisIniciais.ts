/**
 * O que sobrou da credencial que o gestor entregava ao corretor.
 *
 * Até a fase 2A (19/10/2026) este módulo FABRICAVA o acesso: e-mail
 * `nome@nexthome.com` e senha `nexthome` + 4 dígitos do WhatsApp, para o
 * gestor repassar. Isso acabou — o corretor recebe um convite no e-mail real
 * e cria a própria senha (`src/lib/corretores/convite.ts`). O que fica aqui é
 * só RECONHECER o endereço antigo, que ainda existe em contas criadas antes,
 * e a normalização que gera o `slug`.
 *
 * Módulo PURO de propósito: a action de administração, a tela e a guarda de
 * `email.ts` precisam da mesma regra, e módulo com dependência de servidor
 * arrastado para o grafo errado já quebrou o build desta base duas vezes
 * (`limitesPdf.ts`, `pessoasTipos.ts`).
 */

/**
 * Domínio dos e-mails de acesso antigos.
 *
 * ATENÇÃO: `nexthome.com` NÃO é da Next Home — resolve para 72.20.123.54,
 * de terceiro. Nenhum e-mail pode sair para cá (`enviarEmail` recusa), e
 * nenhum link de convite ou de senha (`gerarLinkDeAcesso` recusa). Não é
 * exportado: ninguém mais monta endereço com ele.
 */
const DOMINIO_ACESSO = "nexthome.com";

/**
 * Normalização de nome para endereço: sem acento, minúsculo, só `a-z0-9-`.
 *
 * É a regra que gera o `slug` do corretor. Mora num módulo compartilhado
 * porque duas normalizações do mesmo nome divergem no primeiro "Antônio" que
 * aparecer — esta base já pagou por conta duplicada em `montarResumo` e no
 * porteiro do anúncio (0094).
 */
export function normalizarParaEmail(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** O endereço é o de acesso antigo (domínio de terceiro), não uma caixa que recebe mensagem. */
export function ehEmailDeAcesso(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DOMINIO_ACESSO}`);
}
