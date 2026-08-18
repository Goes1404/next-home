import type { SVGProps } from "react";

/**
 * Mapa de navegação do painel — uma fonte só para a barra lateral, a gaveta
 * do celular e a barra inferior.
 *
 * Antes cada uma tinha a sua lista. A barra inferior conhecia cinco destinos
 * e a de abas conhecia treze, o que deixava oito seções (Imóveis, WhatsApp,
 * Campanhas, Links, Templates, Senha, Preços e Equipe) inalcançáveis no
 * celular: a barra de abas é `hidden md:flex`. Com a lista aqui, quem
 * adiciona uma seção adiciona em todos os lugares por construção.
 */

export type ItemNav = {
  href: string;
  label: string;
  icone: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  /** Só o gestor enxerga — a própria página também se protege com notFound. */
  gestor?: boolean;
};

export type GrupoNav = { titulo: string; itens: ItemNav[] };

export const GRUPOS_NAV: GrupoNav[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/corretor", label: "Início", icone: IconeInicio },
      { href: "/corretor/funil", label: "Funil", icone: IconeFunil },
      { href: "/corretor/leads", label: "Meus leads", icone: IconePessoas },
      { href: "/corretor/importar", label: "Adicionar leads", icone: IconeAdicionar },
      { href: "/corretor/visitas", label: "Visitas", icone: IconeAgenda },
    ],
  },
  {
    titulo: "Conversas",
    itens: [
      { href: "/corretor/whatsapp", label: "WhatsApp IA", icone: IconeConversa },
      { href: "/corretor/campanhas", label: "Campanhas", icone: IconeMegafone },
      { href: "/corretor/templates", label: "Templates", icone: IconeTexto },
    ],
  },
  {
    titulo: "Catálogo",
    itens: [
      { href: "/corretor/imoveis", label: "Imóveis", icone: IconePredio },
      { href: "/corretor/links", label: "Links", icone: IconeElo },
      { href: "/corretor/precos", label: "Preços", icone: IconeEtiqueta, gestor: true },
    ],
  },
  {
    titulo: "Conta",
    itens: [
      { href: "/corretor/perfil", label: "Perfil", icone: IconePessoa },
      { href: "/corretor/equipe", label: "Equipe", icone: IconeEquipe, gestor: true },
      { href: "/corretor/senha", label: "Senha", icone: IconeChave },
    ],
  },
];

/** Os quatro destinos do polegar, na barra inferior do celular. */
export const ATALHOS_MOBILE: ItemNav[] = [
  { href: "/corretor", label: "Início", icone: IconeInicio },
  { href: "/corretor/funil", label: "Funil", icone: IconeFunil },
  { href: "/corretor/leads", label: "Leads", icone: IconePessoas },
  { href: "/corretor/visitas", label: "Visitas", icone: IconeAgenda },
];

export function gruposVisiveis(ehGestor: boolean): GrupoNav[] {
  return GRUPOS_NAV.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => !i.gestor || ehGestor),
  })).filter((g) => g.itens.length > 0);
}

/**
 * `/corretor` casa exato porque é prefixo de todos os outros; o resto casa
 * por prefixo para que o editor de um imóvel (`/corretor/imoveis/[slug]`)
 * mantenha "Imóveis" aceso em vez de apagar a navegação inteira.
 */
export function rotaAtiva(atual: string | null, href: string): boolean {
  if (!atual) return false;
  return href === "/corretor" ? atual === href : atual.startsWith(href);
}

const traco = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconeInicio(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="m3 9.5 9-6.5 9 6.5V20a1 1 0 0 1-1 1h-4v-7H8v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function IconeAdicionar(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="8.5" cy="7.5" r="3.5" />
      <path d="M18 7v6M15 10h6" />
    </svg>
  );
}
function IconeFunil(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M3 4h18l-7 8.5V20l-4 1v-8.5z" />
    </svg>
  );
}
function IconePessoas(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16.5 4.2a3.5 3.5 0 0 1 0 6.6" />
    </svg>
  );
}
function IconeAgenda(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function IconeConversa(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
    </svg>
  );
}
function IconeMegafone(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M4 9v6h3l7 4V5L7 9zM19 9a4 4 0 0 1 0 6" />
    </svg>
  );
}
function IconeTexto(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  );
}
function IconePredio(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M4 21V6l7-3v18M11 21h9V11l-9-3M15 12h1.5M15 15.5h1.5M15 19h1.5M7 9h1M7 12.5h1M7 16h1" />
    </svg>
  );
}
function IconeElo(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M10 13.5a4 4 0 0 0 5.7.4l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.4l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.6-1.6" />
    </svg>
  );
}
function IconeEtiqueta(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M20.5 12.5 12 21l-9-9V3h9z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}
function IconePessoa(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M19 20v-1.5a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20" />
      <circle cx="12" cy="7.5" r="3.5" />
    </svg>
  );
}
function IconeEquipe(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M3 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1M15 20v-1a3.5 3.5 0 0 1 3-3.4h.5a3 3 0 0 1 3 3V20" />
    </svg>
  );
}
function IconeChave(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3.5M15.5 12v2.5" />
    </svg>
  );
}
