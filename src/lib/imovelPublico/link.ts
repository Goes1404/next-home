// O link público de um imóvel, por grupo (21/10/2026).
//
// Módulo PURO. Três destinos, na ordem:
//   1. grupo 1 (Next Home): `site.url/empreendimentos/<slug>`, como sempre;
//   2. grupo com endereço principal em `enderecos_do_site`:
//      `https://<host>/empreendimentos/<slug>`;
//   3. grupo SEM site: a ficha pública do painel,
//      `<enderecoDoPainel>/imovel/<grupo>/<slug>?c=<corretor>` (a rota
//      `src/app/imovel/[grupo]/[slug]`, aberta em qualquer endereço).
//
// A IA do WhatsApp e a seleção do cliente usam a mesma regra: o endereço é
// montado por código a partir do slug, nunca copiado pelo modelo.

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { enderecoDoPainel } from "@/lib/marcaDoCrm/marca";

/** O que a leitura do grupo diz sobre onde o imóvel dele abre. */
export type BaseDoLinkDoImovel = {
  grupoId: string;
  /** `enderecos_do_site.host` principal; nulo = o grupo não tem site. */
  hostPrincipal: string | null;
  /** `grupos.slug`; nulo = a leitura falhou. */
  grupoSlug: string | null;
  /** Só os testes passam: o resto lê `PAINEL_URL`. */
  painelUrl?: string;
};

const SLUG = /^[a-z0-9-]{1,120}$/;
const HOST = /^[a-z0-9.-]+$/;

function hostValido(host: string | null | undefined): string | null {
  const h = (host ?? "").trim().toLowerCase();
  return h && HOST.test(h) ? h : null;
}

/** Slug de corretor que pode ir para a URL: o que não passa vira "sem corretor". */
function corretorNaUrl(corretorSlug: string | null | undefined): string | null {
  const c = (corretorSlug ?? "").trim();
  return SLUG.test(c) ? c : null;
}

export function montarLinkDoImovel(base: BaseDoLinkDoImovel, slug: string, corretorSlug?: string | null): string {
  if (base.grupoId === GRUPO_NEXT_HOME_ID) return `${site.url}/empreendimentos/${slug}`;
  const host = hostValido(base.hostPrincipal);
  if (host) return `https://${host}/empreendimentos/${slug}`;
  const painel = enderecoDoPainel(base.grupoId, base.painelUrl);
  // Sem o slug do grupo (leitura falhou) não há ficha para apontar; o link
  // do painel leva ao login, que é o que o corretor já via. A leitura que
  // falha não é cacheada, então a próxima mensagem sai certa.
  if (!base.grupoSlug) return `${painel}/empreendimentos/${slug}`;
  const c = corretorNaUrl(corretorSlug);
  return `${painel}/imovel/${base.grupoSlug}/${slug}${c ? `?c=${c}` : ""}`;
}

/** A URL da ficha pública do painel (sem corretor, sem decisão de site). */
export function caminhoDaFichaPublica(grupoSlug: string, slug: string, corretorSlug?: string | null): string {
  const c = corretorNaUrl(corretorSlug);
  return `/imovel/${grupoSlug}/${slug}${c ? `?c=${c}` : ""}`;
}

/**
 * Os links que a IA monta por código, prontos para ir ao prompt e aos
 * guardrails (sem banco). Ausente em quem chama = a Next Home de sempre.
 */
export type LinksDoImovel = {
  /** O link da página do imóvel. */
  pagina(slug: string, corretorSlug?: string | null): string;
  /** Links de página de imóvel já escritos no texto, com o slug de cada um. */
  reconhecer(texto: string): { inteiro: string; slug: string }[];
  /** O link do catálogo do corretor; nulo = o grupo não tem página de catálogo própria. */
  catalogo(corretorSlug: string): string | null;
};

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function linksDoImovel(base: BaseDoLinkDoImovel): LinksDoImovel {
  const host = base.grupoId === GRUPO_NEXT_HOME_ID ? null : hostValido(base.hostPrincipal);
  const painel = enderecoDoPainel(base.grupoId, base.painelUrl);
  const prefixoDaFicha = base.grupoSlug ? `${painel}/imovel/${base.grupoSlug}/` : null;
  return {
    pagina: (slug, corretorSlug) => montarLinkDoImovel(base, slug, corretorSlug),
    reconhecer(texto) {
      const padroes: RegExp[] = [];
      if (base.grupoId === GRUPO_NEXT_HOME_ID) {
        padroes.push(new RegExp(`${escapar(site.url)}/empreendimentos/([\\w-]+)`, "gi"));
      } else if (host) {
        padroes.push(new RegExp(`https://${escapar(host)}/empreendimentos/([\\w-]+)`, "gi"));
      } else if (prefixoDaFicha) {
        padroes.push(new RegExp(`${escapar(prefixoDaFicha)}([\\w-]+)(?:\\?c=[\\w-]+)?`, "gi"));
      }
      return padroes.flatMap((re) => [...texto.matchAll(re)].map((m) => ({ inteiro: m[0], slug: m[1] })));
    },
    catalogo(corretorSlug) {
      if (base.grupoId === GRUPO_NEXT_HOME_ID) return `${site.url}/?corretor=${corretorSlug}`;
      return host ? `https://${host}/?corretor=${corretorSlug}` : null;
    },
  };
}
