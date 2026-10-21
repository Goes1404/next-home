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
import { rotuloDoWhatsapp, type SiteEditavel } from "./siteEditavel";

/** O escritório; sem coordenada (o que o grupo digita não tem), o site não desenha o mapa. */
type Endereco = Omit<typeof site.endereco, "lat" | "lng"> & { lat?: number; lng?: number };
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
  // O que o gestor edita em "Meu site" (0209). SEMPRE nulo na Next Home: o
  // site dela continua vindo de `site.ts` (regra do dono, 21/10/2026).
  /** A logo do grupo (a mesma do CRM, 0208). Nulo = o nome escrito. */
  logoUrl: string | null;
  /** Cor principal `#rrggbb`. Nulo = a cor padrão do site. */
  cor: string | null;
  /** Cor secundária, fundo e texto das páginas (0210). Nulos = o padrão; sempre nulos na Next Home. */
  corSecundaria: string | null;
  corFundo: string | null;
  corTexto: string | null;
  capaUrl: string | null;
  /** Título do topo da home. Nulo = o texto padrão. */
  titulo: string | null;
  /** Frase de abertura do topo da home. Nulo = o texto padrão. */
  frase: string | null;
  /** Texto "Sobre a imobiliária". */
  sobre: string | null;
  email: string | null;
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

/** O CRECI como o rodapé o escreve: `12345-J` (o tipo vem de `grupos.creci_tipo`). */
function creciDoGrupo(p: SiteEditavel | null): string | null {
  const numero = p?.creci?.trim();
  if (!numero) return null;
  if (!p?.creciTipo || /-[JF]$/i.test(numero)) return numero;
  return `${numero}-${p.creciTipo}`;
}

export function marcaDoGrupo({
  grupoId,
  nome,
  url,
  personalizacao,
}: {
  grupoId: string;
  nome: string;
  url: string;
  /** O que o gestor editou (0209). Ignorado no grupo 1; campo vazio cai no padrão. */
  personalizacao?: SiteEditavel | null;
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
      logoUrl: null,
      cor: null,
      corSecundaria: null,
      corFundo: null,
      corTexto: null,
      capaUrl: null,
      titulo: null,
      frase: null,
      sobre: null,
      email: null,
    };
  }
  const nomeLimpo = nome.trim() || "Imóveis";
  const p = personalizacao ?? null;
  const redes = p && (p.instagram || p.facebook) ? { instagram: p.instagram ?? "", facebook: p.facebook ?? "", youtube: "", linkedin: "" } : null;
  return {
    grupoId,
    ehNextHome: false,
    nome: nomeLimpo,
    nomeCompleto: nomeLimpo,
    wordmark: [nomeLimpo, ""],
    descricao: p?.frase ?? `Imóveis selecionados por ${nomeLimpo}: lançamentos, imóveis na planta e prontos para morar.`,
    keywords: [],
    url: semBarra,
    creci: creciDoGrupo(p),
    whatsapp: p?.whatsapp ? [{ numero: p.whatsapp, label: rotuloDoWhatsapp(p.whatsapp) }] : [],
    endereco: p?.endereco ?? null,
    social: redes,
    regioes: [],
    logoUrl: p?.logoUrl ?? null,
    cor: p?.cor ?? null,
    corSecundaria: p?.corSecundaria ?? null,
    corFundo: p?.corFundo ?? null,
    corTexto: p?.corTexto ?? null,
    capaUrl: p?.capaUrl ?? null,
    titulo: p?.titulo ?? null,
    frase: p?.frase ?? null,
    sobre: p?.sobre ?? null,
    email: p?.email ?? null,
  };
}
