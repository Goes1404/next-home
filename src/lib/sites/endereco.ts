// O endereço (Host) de cada site público — fase 3 da plataforma multi-grupo.
//
// Módulo PURO: sem banco, sem Next. O proxy usa `normalizarHost` para montar
// o caminho reescrito (`/s/<host>/...`), e o resolvedor usa o resto para
// decidir de que grupo é um endereço antes (ou em vez) de perguntar ao banco.

import { SLUGS_DE_GRUPO_RESERVADOS } from "@/lib/grupos/slugDoGrupo";

/**
 * Os endereços do site da Next Home (grupo 1). A migration 0201 grava os
 * mesmos em `enderecos_do_site`; aqui eles servem de caminho rápido — o
 * tráfego da Next Home não paga consulta nenhuma para descobrir de quem é o
 * site. Um teste confere que a lista e a semente da migration são iguais.
 */
export const ENDERECOS_DA_NEXT_HOME: readonly string[] = [
  "www.nexthomeimoveis.com",
  "nexthomeimoveis.com",
  "next-home-drab.vercel.app",
];

/** Rótulo de host: letras, números e hífen, sem hífen nas pontas. */
const ROTULO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * O host como chave: minúsculas, sem porta e sem o ponto final. Devolve nulo
 * para o que não é nome de host — o resultado vira um SEGMENTO DE CAMINHO
 * (`/s/<host>`), e uma barra, um `@` ou um colchete ali mudariam a rota.
 */
export function normalizarHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  const porta = h.lastIndexOf(":");
  if (porta !== -1) {
    if (!/^\d+$/.test(h.slice(porta + 1))) return null;
    h = h.slice(0, porta);
  }
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (!h || h.length > 253) return null;
  const rotulos = h.split(".");
  if (!rotulos.every((r) => ROTULO.test(r))) return null;
  return h;
}

/**
 * Endereços da máquina de quem desenvolve e da esteira (E2E contra
 * `next start`). Não são alcançáveis de fora, então servem o site da Next
 * Home sem risco de a marca dela aparecer no endereço de outra pessoa.
 */
export function ehHostDeDesenvolvimento(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * O slug do grupo num endereço gratuito (`<slug>.<domínio da plataforma>`).
 * Um nível só de subdomínio; o domínio da plataforma sozinho e os slugs
 * reservados (www, app, painel...) não são site de grupo. Sem domínio da
 * plataforma configurado (decisão do dono, 19/10: ele é comprado depois do
 * primeiro pagamento), não existe endereço gratuito.
 */
export function slugDoEnderecoGratuito(host: string, dominioDaPlataforma: string | null | undefined): string | null {
  const dominio = normalizarHost(dominioDaPlataforma);
  const h = normalizarHost(host);
  if (!dominio || !h) return null;
  if (!h.endsWith(`.${dominio}`)) return null;
  const slug = h.slice(0, -(dominio.length + 1));
  if (!slug || slug.includes(".")) return null;
  if (SLUGS_DE_GRUPO_RESERVADOS.includes(slug)) return null;
  return slug;
}
