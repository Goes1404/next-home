import type { Metadata } from "next";
import { OG_IMAGEM } from "@/lib/dadosEstruturados";
import { site } from "@/lib/site";

/**
 * A prévia do link do portfólio que o corretor manda no WhatsApp (0188,
 * 19/10/2026). Funções puras.
 *
 * O link é `/?corretor=<slug>`. O `proxy.ts` grava o cookie de atribuição e
 * redireciona para `/portfolio`, e o robô do WhatsApp segue o redirecionamento
 * e lê as metatags de lá (o Next entrega a metadata no `<head>` para ele, que
 * está na lista `htmlLimitedBots`). Até aqui a página tinha metadata fixa,
 * "Portfólio de Imóveis de Alto Padrão em Alphaville", igual para todo
 * corretor, e o dono pediu um texto neutro e editável.
 *
 * O robô não guarda o cookie do redirecionamento, então o corretor tem de vir
 * na URL: o proxy passou a levar `?corretor=<slug>` para `/portfolio`.
 */

/** Teto do texto próprio. É o mesmo do CHECK da coluna na 0188. */
export const LIMITE_CHAMADA_DO_LINK = 160;

/** Descrição da prévia quando o corretor não escreveu a dele. */
export const CHAMADA_PADRAO = "Portfólio de produtos";

export type CorretorDaPrevia = { nome: string; chamadaDoLink?: string | null };

/** Espaços repetidos e quebras de linha viram um espaço; vazio vira `null`. */
export function normalizarChamadaDoLink(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/**
 * Confere o texto que o corretor digitou em "Meu perfil". Devolve o valor a
 * gravar (`null` = volta ao padrão) ou o erro em português.
 */
export function validarChamadaDoLink(
  bruto: string | null | undefined,
): { valor: string | null } | { erro: string } {
  const valor = normalizarChamadaDoLink(bruto);
  if (valor && valor.length > LIMITE_CHAMADA_DO_LINK) {
    return { erro: `O texto da prévia passa de ${LIMITE_CHAMADA_DO_LINK} caracteres.` };
  }
  return { valor };
}

/** "Portfólio de Bruna Souza", ou "Portfólio da Next Home" sem corretor. */
export function tituloDaPrevia(corretor: CorretorDaPrevia | null): string {
  const nome = corretor?.nome.trim();
  return nome ? `Portfólio de ${nome}` : `Portfólio da ${site.nome}`;
}

/** O texto próprio do corretor, se houver; senão "Portfólio de produtos". */
export function descricaoDaPrevia(corretor: CorretorDaPrevia | null): string {
  return normalizarChamadaDoLink(corretor?.chamadaDoLink) ?? CHAMADA_PADRAO;
}

/**
 * Metadata de `/portfolio`. `noindex` continua: a página é a peça que o
 * corretor compartilha, não uma porta de entrada de busca.
 */
export function metadataDoPortfolio(corretor: CorretorDaPrevia | null): Metadata {
  const titulo = tituloDaPrevia(corretor);
  const descricao = descricaoDaPrevia(corretor);
  return {
    // `absolute`: o template do layout raiz acrescentaria " · Next Home".
    title: { absolute: titulo },
    description: descricao,
    robots: { index: false, follow: true },
    openGraph: {
      title: titulo,
      description: descricao,
      siteName: site.nomeCompleto,
      images: [OG_IMAGEM],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [OG_IMAGEM.url],
    },
  };
}
