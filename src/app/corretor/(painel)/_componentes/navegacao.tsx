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
 * A barra do polegar tem TRÊS destinos, e é de propósito:
 *
 *   Agora      ← a fila: o que precisa de você hoje
 *   Pessoas    ← leads, conversas, importar (a MESMA pessoa, uma porta só)
 *   Imóveis    ← links por imóvel
 *
 * O resto — funil, campanhas, IA e, para o gestor, Administração — é o que se
 * faz sentado, e vive na gaveta e na lateral do computador. Perfil e senha
 * moram no menu do avatar (`ITENS_DA_CONTA`), que é onde se procura por elas.
 *
 * As rotas antigas continuam existindo e respondendo; `tambem` mantém o
 * destino certo aceso quando o corretor cai numa delas por link salvo.
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
      { href: "/corretor", label: "Agora", icone: IconeInicio },
      {
        /*
         * Pessoas absorve Leads E Conversas, e é a mudança de fundo desta
         * navegação. Medido em 02/09/2026: 91 dos 116 leads têm conversa e 91
         * das 127 conversas têm lead — em 91 casos a MESMA pessoa existia em
         * dois destinos, com ações diferentes em cada um. A primeira decisão
         * que o painel pedia era "por qual porta eu falo com o Fulano?", e
         * essa é justamente a pergunta que ninguém responde sem treino.
         */
        href: "/corretor/pessoas",
        label: "Pessoas",
        icone: IconePessoas,
        tambem: ["/corretor/leads", "/corretor/conversas", "/corretor/importar"],
      },
      {
        href: "/corretor/imoveis",
        label: "Imóveis",
        icone: IconePredio,
      },
    ],
  },
  {
    /*
     * O que não se faz em pé, no corredor. Sai da barra do polegar e passa a
     * dar CONTEÚDO à gaveta — que até aqui repetia os mesmos itens da barra e
     * custava um toque para mostrar o que já estava na tela.
     */
    titulo: "Ferramentas",
    itens: [
      {
        href: "/corretor/funil",
        label: "Funil",
        icone: IconeFunil,
        tambem: ["/corretor/visitas"],
      },
      {
        /*
         * Marketing reúne o que PRODUZ e o que DISPARA peça: arte, vídeo,
         * carrossel, links de indicação e a fila de campanha. Antes estava
         * espalhado — arte e links dentro de Imóveis, campanha num destino
         * próprio —, e o corretor precisava saber onde cada coisa mora para
         * achá-la.
         *
         * Ela absorve Campanhas em vez de somar ao menu: disparo é peça de
         * saída, é marketing por definição, e o teto de sete destinos existe
         * porque acima disso o menu deixa de ser lido e passa a ser
         * procurado. As rotas antigas continuam respondendo.
         */
        href: "/corretor/marketing",
        label: "Marketing",
        icone: IconeMegafone,
        tambem: ["/corretor/campanhas", "/corretor/templates", "/corretor/links"],
      },
      { href: "/corretor/whatsapp", label: "Minha IA", icone: IconeConversa },
    ],
  },
  {
    titulo: "Equipe",
    itens: [
      {
        // As cinco telas de administração viram abas: o gestor também atende
        // lead, e cinco itens de admin no menu invertem essa proporção.
        href: "/corretor/admin",
        label: "Administração",
        icone: IconeEquipe,
        tambem: ["/corretor/admin/precos"],
        gestor: true,
      },
    ],
  },
];

/**
 * Conta e senha saíram do menu e foram para o menu do avatar, no cabeçalho.
 *
 * Não é economia de espaço por si: era o destino MENOS visitado ocupando um
 * dos cinco slots, enquanto Imóveis — que o corretor abre para mandar foto no
 * meio de uma conversa — não cabia na barra do polegar e só existia atrás da
 * gaveta. Trocar os dois de lugar põe o que se usa todo dia a um toque e o
 * que se usa uma vez por mês onde já se procura por ele: o próprio avatar.
 *
 * As rotas continuam as mesmas; só o caminho até elas mudou.
 */
export const ITENS_DA_CONTA: ItemNav[] = [
  { href: "/corretor/perfil", label: "Meu perfil", icone: IconePessoa },
  { href: "/corretor/senha", label: "Trocar senha", icone: IconeChave },
];

/**
 * Os destinos do polegar, na barra inferior do celular (mais o botão Menu).
 *
 * Derivado do grupo "Trabalho" em vez de repetido: esta lista era uma cópia
 * literal dos mesmos itens, com os mesmos `tambem` escritos de novo — duas
 * listas que precisavam ser mantidas iguais à mão. Bastava alguém absorver
 * uma rota nova em Leads e esquecer daqui para o item apagar no celular e
 * acender no computador, na mesma rota.
 *
 * São TRÊS: Agora, Pessoas e Imóveis. Leads e WhatsApp deixaram de ser
 * dois destinos porque eram a mesma pessoa, e o que sobrou de ferramenta
 * (funil, campanhas, IA) foi para a gaveta, que antes só repetia a barra.
 */
export const ATALHOS_MOBILE: ItemNav[] = GRUPOS_NAV[0].itens;

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

/**
 * O módulo em que a rota atual mora — a chave do color coding do painel.
 *
 * Cada módulo tem uma cor, e a cor responde "onde eu estou". Quem pinta é o
 * CSS: `[data-modulo="leads"]` reaponta a família `--color-acento`, que
 * cerca de 260 usos do painel já consomem, então o painel inteiro se
 * recolore sem que nenhum componente saiba disso.
 *
 * Isto é derivado do MESMO mapa que acende o item do menu. Ter uma segunda
 * lista de "rota → cor" seria uma segunda verdade para divergir da primeira:
 * bastaria alguém acrescentar uma rota a `tambem` e esquecer da outra lista
 * para o menu acender "Leads" numa tela pintada de outra cor.
 *
 * Devolve `null` fora do painel e em rota que nenhum destino reivindica —
 * aí o CSS cai no tom padrão em vez de inventar um.
 */
export type Modulo =
  | "inicio"
  | "leads"
  | "whatsapp"
  | "imoveis"
  | "marketing"
  | "conta"
  | "admin";

const MODULO_POR_DESTINO: Record<string, Modulo> = {
  "/corretor": "inicio",
  "/corretor/pessoas": "leads",
  "/corretor/funil": "leads",
  "/corretor/imoveis": "imoveis",
  "/corretor/marketing": "marketing",
  "/corretor/whatsapp": "whatsapp",
  "/corretor/perfil": "conta",
  "/corretor/senha": "conta",
  "/corretor/admin": "admin",
};

export function moduloAtivo(atual: string | null): Modulo | null {
  if (!atual) return null;
  const todos = [...GRUPOS_NAV.flatMap((g) => g.itens), ...ITENS_DA_CONTA];
  // O mais específico ganha: `/corretor` casa exato e os demais por prefixo,
  // mas um item pode absorver a rota de outro via `tambem`, e aí quem tem o
  // href mais longo é o dono legítimo.
  const dono = todos
    .filter((i) => itemAtivo(atual, i))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return dono ? (MODULO_POR_DESTINO[dono.href] ?? null) : null;
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
/* Funil: três barras decrescentes — a carteira vista por etapa. */
function IconeFunil(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

/* Megafone: a mensagem que sai para muita gente de uma vez. */
function IconeMegafone(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

/* Cadeado: a troca de senha, no menu do avatar. */
function IconeChave(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...traco} {...p}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
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
