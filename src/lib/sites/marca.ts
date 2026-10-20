// A marca do site público de cada grupo (fase 3 enxuta).
//
// Módulo PURO. O grupo 1 tem a marca da Next Home inteira (`site.ts`). Os
// outros grupos, até o portfólio editável existir (pendência da fase 3), têm
// uma marca NEUTRA: só o nome do grupo e o endereço do site. Telefone, CRECI,
// endereço do escritório, redes sociais, vinheta e fundos da Next Home NUNCA
// aparecem no site de outro grupo — seriam o contato da Next Home no site de
// outra empresa, e o visitante dela escrevendo para quem não o atende.

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";

type Endereco = typeof site.endereco;
type Social = typeof site.social;

export type MarcaDoSite = {
  grupoId: string;
  /** A Next Home: vinheta, fundos e dados de contato da casa. */
  ehNextHome: boolean;
  nome: string;
  nomeCompleto: string;
  wordmark: [string, string];
  descricao: string;
  keywords: string[];
  /** `https://<endereço principal>`, sem barra no fim. */
  url: string;
  creci: string | null;
  /** Os WhatsApps da casa (só a Next Home tem; os outros sites usam o `/wa`). */
  whatsapp: { numero: string; label: string }[];
  endereco: Endereco | null;
  social: Social | null;
  regioes: string[];
};

/** O endereço do escritório numa linha, ou nulo quando o site não tem. */
export function linhaDoEndereco(marca: MarcaDoSite): string | null {
  const e = marca.endereco;
  return e ? `${e.logradouro} — ${e.bairro}, ${e.cidade}/${e.uf}` : null;
}

/** As redes que o site tem, na ordem do rodapé. */
export function redesDaMarca(marca: MarcaDoSite): { href: string; label: string }[] {
  const s = marca.social;
  if (!s) return [];
  return [
    { href: s.instagram, label: "Instagram" },
    { href: s.facebook, label: "Facebook" },
    { href: s.youtube, label: "YouTube" },
    { href: s.linkedin, label: "LinkedIn" },
  ].filter((r) => r.href);
}

export function marcaDoGrupo({
  grupoId,
  nome,
  url,
}: {
  grupoId: string;
  nome: string;
  url: string;
}): MarcaDoSite {
  const semBarra = url.replace(/\/+$/, "");
  if (grupoId === GRUPO_NEXT_HOME_ID) {
    return {
      grupoId,
      ehNextHome: true,
      nome: site.nome,
      nomeCompleto: site.nomeCompleto,
      wordmark: site.wordmark,
      descricao: site.descricao,
      keywords: [...site.keywords],
      // O endereço canônico da Next Home continua sendo o de `site.url`
      // (NEXT_PUBLIC_SITE_URL): os links que o WhatsApp e o painel já
      // mandaram apontam para ele.
      url: site.url.replace(/\/+$/, ""),
      creci: site.creci,
      whatsapp: site.whatsapp.map((w) => ({ ...w })),
      endereco: site.endereco,
      social: site.social,
      regioes: [...site.regioes],
    };
  }
  const nomeLimpo = nome.trim() || "Imóveis";
  return {
    grupoId,
    ehNextHome: false,
    nome: nomeLimpo,
    nomeCompleto: nomeLimpo,
    wordmark: [nomeLimpo, ""],
    descricao: `Imóveis selecionados por ${nomeLimpo}: lançamentos, imóveis na planta e prontos para morar.`,
    keywords: [],
    url: semBarra,
    creci: null,
    whatsapp: [],
    endereco: null,
    social: null,
    regioes: [],
  };
}
