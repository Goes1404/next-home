/**
 * Tema visual escolhido pelo visitante — módulo PURO, sem `next/headers`.
 *
 * Até 12/10/2026 este arquivo lia o cookie NO SERVIDOR (`getTemaEscolhido`,
 * com `cookies()`), e o layout raiz carimbava `data-tema` já na primeira
 * resposta. Era elegante e tinha um custo que ninguém via na tela: `cookies()`
 * no layout raiz torna TODA rota do site dinâmica — a home, o catálogo, a
 * ficha de cada imóvel saíam `private, no-cache, no-store` com
 * `X-Vercel-Cache: MISS`, renderizadas por função a cada visita, inclusive
 * para o Google. É a F2b do roadmap de performance (a casca estática), e o
 * tema era a única coisa que a impedia no layout raiz.
 *
 * Hoje o servidor não sabe o tema: o HTML sai sempre com o padrão da casa
 * (`data-tema="claro"`) e um script inline, o primeiro do `<body>`, lê o
 * cookie e corrige o atributo ANTES da primeira pintura — o mesmo mecanismo
 * do `Preloader`, que já decidia a vinheta assim. Para quem está no escuro
 * não há flash: quando o navegador pinta a primeira linha, o `<html>` já
 * está certo. É o que sites estáticos sempre fizeram; a diferença é que
 * aqui ele é a única coisa que roda antes do conteúdo.
 *
 * Três estados, não dois: "claro", "escuro" e — sem cookie — o padrão da
 * casa, que é CLARO desde 10/09/2026 (decisão de marca; ver o comentário em
 * `app/layout.tsx`). O terceiro botão do seletor ("seguir o sistema") apaga
 * o cookie e volta a esse padrão; ele NÃO entrega o tema do sistema
 * operacional, e nunca entregou de forma estável — a versão antiga apagava o
 * atributo no clique e o servidor devolvia claro no recarregamento seguinte.
 *
 * O painel (`/corretor/*`) usa o MESMO mecanismo: é a mesma casca raiz, e
 * o cookie é o mesmo. E o cookie é gravado pelo próprio navegador
 * (`gravarCookieDoTema`): nenhum servidor o lê, então nenhum servidor o
 * escreve.
 */
export const COOKIE_TEMA = "tema";

export type Tema = "claro" | "escuro";

/** O que vale quando não há cookie: a decisão de marca de 10/09/2026. */
export const TEMA_PADRAO: Tema = "claro";

/**
 * Cor que o navegador usa na própria barra (Chrome no Android, Safari no iOS).
 * Precisa acompanhar o fundo da página, senão a moldura do navegador fica de
 * um tema e o conteúdo do outro.
 *
 * São os mesmos valores de `--color-fundo` em cada leitura, escritos à mão
 * porque `<meta>` não lê variável CSS. O script abaixo os reescreve no
 * `<meta name="theme-color">` quando o cookie diz "escuro".
 */
export const COR_DA_BARRA: Record<Tema, string> = {
  escuro: "#040b0a",
  claro: "#cfd9c2",
};

/**
 * Atributo que diz o que o VISITANTE escolheu, separado do que está
 * aplicado: `data-tema` é sempre claro ou escuro (é o que o CSS lê);
 * `data-tema-escolhido` é claro, escuro ou `sistema` (nenhum cookie), e é
 * dele que o seletor sabe qual botão marcar. Sem a separação, "claro
 * escolhido" e "sem escolha" seriam indistinguíveis no DOM.
 */
export const ATRIBUTO_ESCOLHA = "data-tema-escolhido";
export const EVENTO_TEMA = "nh-tema";

function lerDoCookie(valor: string | undefined): Tema | null {
  return valor === "claro" || valor === "escuro" ? valor : null;
}

/**
 * O script que roda antes da primeira pintura. Deliberadamente pequeno e
 * sem dependência: ele é o único código que precisa estar certo para o
 * visitante não ver o tema errado. Qualquer erro cai no padrão que o HTML já
 * trouxe (claro), que é o comportamento sem JavaScript.
 *
 * Sem `\b`, `\d` nem outra sequência de escape de propósito: este texto já
 * viaja por três camadas (TypeScript → HTML → JavaScript) e esta base perdeu
 * horas com barras invertidas que viravam outra coisa no caminho.
 */
export const SCRIPT_TEMA_ANTES_DA_PINTURA = `try{
  var m=document.cookie.match(/(?:^|; )${COOKIE_TEMA}=(claro|escuro)(?:;|$)/);
  var t=m?m[1]:null;
  var h=document.documentElement;
  h.setAttribute("${ATRIBUTO_ESCOLHA}",t||"sistema");
  if(t){
    h.setAttribute("data-tema",t);
    var cor={claro:"${COR_DA_BARRA.claro}",escuro:"${COR_DA_BARRA.escuro}"}[t];
    var mt=document.querySelector('meta[name="theme-color"]');
    if(mt)mt.setAttribute("content",cor);
    var cs=document.querySelector('meta[name="color-scheme"]');
    if(cs)cs.setAttribute("content",t==="escuro"?"dark":"light");
  }
}catch(e){}`;

/** Lê, do DOM, o que o visitante escolheu (`null` = sem escolha, padrão). */
export function lerEscolhaDoDom(): Tema | null {
  if (typeof document === "undefined") return null;
  return lerDoCookie(document.documentElement.getAttribute(ATRIBUTO_ESCOLHA) ?? undefined);
}

/**
 * Aplica a escolha no DOM na hora — `<html>`, cor da barra e `color-scheme`
 * — e avisa quem assina (`assinarTema`). É o que o seletor chama no clique,
 * antes de a Server Action gravar o cookie: sem isto o tema só mudaria no
 * próximo carregamento. Fora de componente de propósito: o compilador do
 * React não deixa mutar o DOM direto dentro de um handler.
 */
export function aplicarTemaNoDom(escolha: Tema | null): void {
  const aplicado = escolha ?? TEMA_PADRAO;
  const html = document.documentElement;
  html.dataset.tema = aplicado;
  html.setAttribute(ATRIBUTO_ESCOLHA, escolha ?? "sistema");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_DA_BARRA[aplicado]);
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", aplicado === "escuro" ? "dark" : "light");
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

/**
 * Grava a escolha no cookie, NO NAVEGADOR. Até 12/10/2026 isso era uma
 * Server Action (`definirTema`), e ela tinha um efeito colateral que só o
 * navegador mostrou: toda action que mexe em cookie faz o Next buscar de
 * novo a árvore da rota, e a árvore nova trazia o `<meta theme-color>` do
 * servidor — claro — por cima do que `aplicarTemaNoDom` acabara de
 * escrever. A barra do navegador voltava à cor errada até o próximo
 * recarregamento. Como o servidor não lê mais este cookie (a página é
 * estática), não há motivo para ele viajar até lá: quem lê é o script
 * inline, no mesmo navegador que grava. Um ano de validade; `null` apaga.
 * `Secure` só em HTTPS, senão o cookie não grava no `next start` local.
 */
export function gravarCookieDoTema(escolha: Tema | null): void {
  const seguro = location.protocol === "https:" ? "; Secure" : "";
  const idade = escolha ? 60 * 60 * 24 * 365 : 0;
  document.cookie = `${COOKIE_TEMA}=${escolha ?? ""}; Path=/; Max-Age=${idade}; SameSite=Lax${seguro}`;
}

/** Assinatura para `useSyncExternalStore`: avisa quando `aplicarTemaNoDom` rodou. */
export function assinarTema(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_TEMA, aoMudar);
  return () => window.removeEventListener(EVENTO_TEMA, aoMudar);
}
