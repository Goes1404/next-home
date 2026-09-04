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

/**
 * Um subtópico: uma tela DENTRO de um destino.
 *
 * Não tem ícone de propósito. Ícone repetido em cinco linhas recuadas vira
 * ruído — o que diz "isto pertence àquilo" é o recuo, não um segundo símbolo.
 *
 * `contador` e `ponto` existem porque os subtópicos são a MESMA lista que as
 * abas de seção desenham, e as abas já mostram "3 sem revisão" e o pontinho
 * de conexão. Sem eles aqui, mover a hierarquia para o menu perderia
 * informação que hoje está na tela.
 */
export type SubItemNav = {
  href: string;
  label: string;
};

export type ItemNav = {
  href: string;
  label: string;
  icone: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  /** Rotas absorvidas por este destino: mantêm o item aceso sem aparecer no menu. */
  tambem?: string[];
  /** Só o gestor enxerga — a própria página também se protege com notFound. */
  gestor?: boolean;
  /**
   * As telas de dentro deste destino.
   *
   * NÃO são itens de menu: `gruposVisiveis` não as achata, e o teto de sete
   * destinos continua contando só os tópicos. Foi o teto que empurrou cada
   * tela nova para virar sub-rota alcançável só por link direto — Fila de
   * cadastro, Criar arte, Criar vídeo, Carrossel — e `/corretor/links` chegou
   * a não ter item de menu NEM aba, caindo no vão entre os dois. O subtópico
   * é o lugar onde essa hierarquia passa a caber.
   */
  subitens?: SubItemNav[];
};

export type GrupoNav = { titulo: string; itens: ItemNav[] };

export const GRUPOS_NAV: GrupoNav[] = [
  {
    titulo: "Trabalho",
    itens: [
      { href: "/corretor", label: "Agora", icone: IconeInicio },
      {
        /*
         * Pessoas absorve Leads, e é a mudança de fundo desta navegação.
         * Medido em 02/09/2026: 91 dos 116 leads têm conversa e 91 das 127
         * conversas têm lead — em 91 casos a MESMA pessoa existia em dois
         * destinos, com ações diferentes em cada um. A primeira decisão que o
         * painel pedia era "por qual porta eu falo com o Fulano?", e essa é
         * justamente a pergunta que ninguém responde sem treino.
         *
         * Pessoas continua sendo a única porta para FALAR com alguém. O que
         * mudou em 04/09 é que Conversas passou para WhatsApp: ali não se
         * escolhe com quem falar, se confere o que a IA andou dizendo (é onde
         * mora a revisão 👍/👎). São trabalhos diferentes.
         *
         * Funil desceu de destino para subtópico. Ele era item de menu E aba
         * de `AbasLeads` ao mesmo tempo — o pai duplo mais visível do painel.
         */
        href: "/corretor/pessoas",
        label: "Pessoas",
        icone: IconePessoas,
        subitens: [
          { href: "/corretor/leads", label: "Lista" },
          { href: "/corretor/funil", label: "Funil" },
          { href: "/corretor/visitas", label: "Visitas" },
          { href: "/corretor/importar", label: "Adicionar" },
        ],
      },
      {
        href: "/corretor/imoveis",
        label: "Imóveis",
        icone: IconePredio,
        // A fila de cadastro virou sub-rota justamente porque o menu estava no
        // teto; era alcançável só pelo cartão da tela de Imóveis.
        subitens: [{ href: "/corretor/imoveis/candidatos", label: "Fila de cadastro" }],
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
        /*
         * WhatsApp é o CANAL: a conexão, o que a IA respondeu, e o ajuste
         * dela. Antes "Minha IA" era o destino e Conversas vivia absorvida por
         * Pessoas — o que produzia o defeito de 04/09: a tela de Conversas
         * desenhava abas de WhatsApp enquanto o menu acendia Pessoas.
         */
        href: "/corretor/whatsapp",
        label: "WhatsApp",
        icone: IconeConversa,
        subitens: [
          { href: "/corretor/conversas", label: "Conversas" },
          { href: "/corretor/whatsapp", label: "Minha IA" },
        ],
      },
      {
        /*
         * Marketing reúne o que PRODUZ e o que DISPARA peça: arte, vídeo,
         * carrossel, links de indicação e a fila de campanha. Antes estava
         * espalhado — arte e links dentro de Imóveis, campanha num destino
         * próprio —, e o corretor precisava saber onde cada coisa mora.
         *
         * Campanhas e Modelos eram absorvidos por Marketing no menu mas
         * desenhavam abas de WhatsApp: o sidebar acendia magenta e a tela
         * mostrava outra seção. Agora são Marketing nos dois lugares.
         *
         * `/corretor/links` não tinha item de menu NEM aba — era a única tela
         * do painel sem nenhum pai. Aqui ela ganha um.
         */
        href: "/corretor/marketing",
        label: "Marketing",
        icone: IconeMegafone,
        subitens: [
          { href: "/corretor/imoveis/criar-imagem", label: "Criar arte" },
          { href: "/corretor/marketing/video", label: "Criar vídeo" },
          { href: "/corretor/campanhas", label: "Listas de transmissão" },
          { href: "/corretor/templates", label: "Modelos" },
          { href: "/corretor/links", label: "Meus links" },
        ],
      },
    ],
  },
  {
    titulo: "Equipe",
    itens: [
      {
        // As seis telas de administração são subtópicos, não destinos: o
        // gestor também atende lead, e seis itens de admin no menu inverteriam
        // essa proporção.
        href: "/corretor/admin",
        label: "Administração",
        icone: IconeEquipe,
        gestor: true,
        subitens: [
          { href: "/corretor/admin", label: "Visão geral" },
          { href: "/corretor/admin/leads", label: "Leads da equipe" },
          { href: "/corretor/admin/contas", label: "Contas" },
          { href: "/corretor/admin/whatsapp", label: "WhatsApp da equipe" },
          { href: "/corretor/admin/anuncios", label: "Anúncios" },
          { href: "/corretor/admin/precos", label: "Preços" },
        ],
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

/**
 * Os subtópicos de um destino — a MESMA lista que a barra de abas desenha.
 *
 * É esta função que impede a divergência voltar. Até 04/09/2026 as abas eram
 * escritas à mão em `AbasLeads`/`AbasWhatsapp`/`AbasAdmin`, separadas do mapa
 * do menu, e as duas listas discordavam: `/corretor/campanhas` era Marketing
 * no menu e desenhava abas de WhatsApp na tela; `/corretor/conversas` era
 * Pessoas no menu e também mostrava WhatsApp. O sidebar acendia uma seção e a
 * tela dizia outra.
 *
 * Com uma fonte só, a pergunta "quem é o pai desta rota" passa a ter uma
 * resposta em vez de duas — a mesma lição do `ATALHOS_MOBILE`, que deixou de
 * ser cópia da barra e virou o próprio grupo.
 */
export function subitensDe(href: string): SubItemNav[] {
  const item = GRUPOS_NAV.flatMap((g) => g.itens).find((i) => i.href === href);
  return item?.subitens ?? [];
}

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

/**
 * Um item está ativo na própria rota, numa que absorveu (`tambem`) ou em
 * qualquer subtópico seu.
 */
export function itemAtivo(atual: string | null, item: ItemNav): boolean {
  if (rotaAtiva(atual, item.href)) return true;
  if ((item.tambem ?? []).some((href) => rotaAtiva(atual, href))) return true;
  return (item.subitens ?? []).some((sub) => rotaAtiva(atual, sub.href));
}

/**
 * O ÚNICO destino dono da rota atual — o mais específico.
 *
 * `itemAtivo` responde "este item acende?", e com subtópicos passou a haver
 * rota em que DOIS itens respondem sim: `/corretor/imoveis/criar-imagem` é
 * subtópico de Marketing e ao mesmo tempo casa por prefixo com Imóveis. Sem
 * desempate, o menu acenderia os dois e a hierarquia deixaria de dizer onde a
 * pessoa está.
 *
 * O critério é o href mais longo, que é o mesmo já usado para escolher a cor
 * do módulo — e tem de ser o mesmo, senão o item aceso e a cor da tela podem
 * discordar. Subtópico conta com o comprimento DELE, não o do pai.
 */
export function destinoAtivo(atual: string | null): ItemNav | null {
  if (!atual) return null;
  const candidatos = GRUPOS_NAV.flatMap((g) => g.itens).filter((i) => itemAtivo(atual, i));
  if (candidatos.length <= 1) return candidatos[0] ?? null;

  const especificidade = (i: ItemNav): number => {
    const hrefs = [i.href, ...(i.tambem ?? []), ...(i.subitens ?? []).map((s) => s.href)];
    return Math.max(...hrefs.filter((h) => rotaAtiva(atual, h)).map((h) => h.length));
  };
  return [...candidatos].sort((a, b) => especificidade(b) - especificidade(a))[0];
}

/** O subtópico exato em que a rota está, para acender a linha recuada. */
export function subitemAtivo(atual: string | null, item: ItemNav): SubItemNav | null {
  if (!atual) return null;
  const casam = (item.subitens ?? []).filter((s) => rotaAtiva(atual, s.href));
  // `/corretor/admin` é prefixo de todos os outros de admin: o mais longo ganha.
  return [...casam].sort((a, b) => b.href.length - a.href.length)[0] ?? null;
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
  "/corretor/imoveis": "imoveis",
  "/corretor/marketing": "marketing",
  "/corretor/whatsapp": "whatsapp",
  "/corretor/perfil": "conta",
  "/corretor/senha": "conta",
  "/corretor/admin": "admin",
};

/**
 * Subtópico cuja cor NÃO é a do pai.
 *
 * Só existe por causa de duas rotas que moram sob `/corretor/imoveis` mas são
 * peça de marketing: criar arte e o carrossel. Sem esta exceção o painel
 * pintaria de Imóveis uma tela que o menu acende em Marketing — a divergência
 * entre item aceso e cor da tela que esta reforma veio acabar.
 *
 * O resto dos subtópicos herda o módulo do pai, e é assim que se quer: são a
 * mesma seção.
 */
const MODULO_POR_SUBITEM: Record<string, Modulo> = {
  "/corretor/imoveis/criar-imagem": "marketing",
};

export function moduloAtivo(atual: string | null): Modulo | null {
  if (!atual) return null;

  // Exceção primeiro: ela existe justamente para ganhar do prefixo do pai.
  const excecao = Object.keys(MODULO_POR_SUBITEM)
    .filter((href) => rotaAtiva(atual, href))
    .sort((a, b) => b.length - a.length)[0];
  if (excecao) return MODULO_POR_SUBITEM[excecao];

  const dono = destinoAtivo(atual);
  if (dono) return MODULO_POR_DESTINO[dono.href] ?? null;

  // Conta não é destino de menu (mora no avatar), então resolve à parte.
  const daConta = ITENS_DA_CONTA.filter((i) => itemAtivo(atual, i)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return daConta ? (MODULO_POR_DESTINO[daConta.href] ?? null) : null;
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
