/**
 * Tema claro/escuro — regras compartilhadas entre o script inline do layout
 * raiz, o alternador e o componente que reaplica o tema a cada navegação.
 *
 * O tema é uma decisão do PAINEL, não do site. As páginas públicas são uma
 * peça escura por projeto (vídeo de fundo, vidro em WebGL, mapa escuro), e
 * um "modo claro" ali seria outro layout, não outra paleta. Por isso o
 * atributo `data-tema` só é escrito em rotas `/corretor`: fora delas ele é
 * removido e as escalas fixas de `globals.css` mandam sozinhas.
 */

export type Tema = "claro" | "escuro";

export const CHAVE_TEMA = "nexthome:tema";

/** Prefixo das rotas que têm tema. Precisa casar com `scriptTema`. */
export const PREFIXO_PAINEL = "/corretor";

export function ehTema(valor: unknown): valor is Tema {
  return valor === "claro" || valor === "escuro";
}

export function lerTemaSalvo(): Tema | null {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    return ehTema(salvo) ? salvo : null;
  } catch {
    return null;
  }
}

/** Sem escolha registrada, segue o sistema — e o sistema, no silêncio, é escuro. */
export function temaPreferido(): Tema {
  if (typeof window === "undefined") return "escuro";
  return lerTemaSalvo() ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro");
}

export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
}

/**
 * Roda antes da primeira pintura, no <head>. Sem ele o painel claro abre
 * escuro por um quadro e clareia depois — o flash que todo tema mal
 * instalado tem. É `try/catch` porque `localStorage` lança em navegação
 * privada de alguns navegadores, e um tema errado é melhor que uma tela
 * branca.
 */
export const scriptTema = `(function(){try{
var d=document.documentElement,p=location.pathname.indexOf("${PREFIXO_PAINEL}")===0;
d.dataset.area=p?"painel":"site";
if(!p){delete d.dataset.tema;return}
var t=localStorage.getItem("${CHAVE_TEMA}");
if(t!=="claro"&&t!=="escuro"){t=matchMedia("(prefers-color-scheme: light)").matches?"claro":"escuro"}
d.dataset.tema=t;
}catch(e){}})()`;
