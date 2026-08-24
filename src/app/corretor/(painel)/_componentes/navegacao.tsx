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
 *
 * O corretor comum vê CINCO destinos, e é de propósito: o painel tem treze
 * telas, e treze itens de menu obrigam a decidir onde procurar antes de
 * procurar. O que é parente virou aba (`AbasSecao`), não item:
 *
 *   Início
 *   Leads      ← funil, visitas, importar
 *   WhatsApp   ← conversas, campanhas, configuração da IA, templates
 *   Imóveis    ← links por imóvel
 *   Conta      ← senha; e, para o gestor, Administração ao lado
 *
 * As rotas antigas continuam existindo — só saíram do menu; `tambem` mantém
 * o destino certo aceso quando o corretor está nelas, e nenhum link salvo
 * quebra.
 */

export type ItemNav = {
  href: string;
  label: string;
  icone: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  /** Rotas absorvidas por este destino: mantêm o item aceso sem aparecer no menu. */
  tambem?: string[];
  /** Só o gestor enxerga — a própria página também se protege com notFound. */
  gestor?: boolean;
};

export type GrupoNav = { titulo: string; itens: ItemNav[] };

export const GRUPOS_NAV: GrupoNav[] = [
  {
    titulo: "Trabalho",
    itens: [
      { href: "/corretor", label: "Início", icone: IconeInicio },
      {
        href: "/corretor/leads",
        label: "Leads",
        icone: IconePessoas,
        tambem: ["/corretor/funil", "/corretor/visitas", "/corretor/importar"],
      },
      {
        // Conversas, Campanhas e a configuração da IA falam do mesmo número,
        // do mesmo cliente e da mesma IA — viraram abas de um destino só.
        href: "/corretor/conversas",
        label: "WhatsApp",
        icone: IconeConversa,
        tambem: ["/corretor/campanhas", "/corretor/whatsapp", "/corretor/templates"],
      },
      {
        href: "/corretor/imoveis",
        label: "Imóveis",
        icone: IconePredio,
        tambem: ["/corretor/links"],
      },
    ],
  },
  {
    titulo: "Conta",
    itens: [
      {
        href: "/corretor/perfil",
        label: "Conta",
        icone: IconePessoa,
        tambem: ["/corretor/senha"],
      },
      {
        // As cinco telas de administração viraram abas: o gestor também
        // atende lead, e cinco itens de admin no menu invertem essa
        // proporção.
        href: "/corretor/admin",
        label: "Administração",
        icone: IconeEquipe,
        tambem: ["/corretor/precos"],
        gestor: true,
      },
    ],
  },
];

/** Os destinos do polegar, na barra inferior do celular (mais o botão Menu). */
export const ATALHOS_MOBILE: ItemNav[] = [
  { href: "/corretor", label: "Início", icone: IconeInicio },
  {
    href: "/corretor/leads",
    label: "Leads",
    icone: IconePessoas,
    tambem: ["/corretor/funil", "/corretor/visitas", "/corretor/importar"],
  },
  {
    href: "/corretor/conversas",
    label: "WhatsApp",
    icone: IconeConversa,
    tambem: ["/corretor/campanhas", "/corretor/whatsapp", "/corretor/templates"],
  },
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

/** Um item está ativo na sua própria rota ou em qualquer rota que absorveu. */
export function itemAtivo(atual: string | null, item: ItemNav): boolean {
  if (rotaAtiva(atual, item.href)) return true;
  return (item.tambem ?? []).some((href) => rotaAtiva(atual, href));
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
function IconePessoas(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16.5 4.2a3.5 3.5 0 0 1 0 6.6" />
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
function IconePredio(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M4 21V6l7-3v18M11 21h9V11l-9-3M15 12h1.5M15 15.5h1.5M15 19h1.5M7 9h1M7 12.5h1M7 16h1" />
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
