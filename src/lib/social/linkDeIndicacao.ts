import { site } from "@/lib/site";

/**
 * O link que vai no carrossel — e que fecha a medição.
 *
 * `/?corretor=<slug>` já é resolvido pelo `proxy.ts`: grava um cookie de
 * atribuição de 30 dias e redireciona para o portfólio. Com `origem=ig`, o
 * clique fica identificado em `cliques_whatsapp.url_origem`, que já guarda
 * `pathname + search`.
 *
 * É o que separa este recurso do resto do trabalho de Instagram: dá para
 * saber se o post virou lead, com a máquina que já existe e sem uma linha
 * de código nova de rastreio.
 *
 * Sem slug (há corretor assim em produção) o link cairia em `?corretor=`,
 * que leva a uma home sem vínculo nenhum — pior que não marcar. Aí vai o
 * endereço limpo.
 */
export function linkDeIndicacao(slug: string | null | undefined): string {
  const base = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return slug ? `${base}/?corretor=${slug}&origem=ig` : base;
}
