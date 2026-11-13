import { ehRotaDeTokenDoCliente } from "@/lib/enderecosDoPainel";

/**
 * O documento inteiro é da Astro? (13/11/2026)
 *
 * O relato foi "ainda vejo muitas transições e páginas verdes (da Next)".
 * A regra de 29/10 reapontava as cores só quando a página tinha
 * `[data-rota="painel"]` ou `[data-astro]` DENTRO dela. Entre uma tela e
 * outra (layout desmontado), nas telas sem marcador (/auth, telas soltas de
 * /corretor, 404) e na barra do Android antes da hidratação, valia o padrão
 * do site, que é o verde da Next Home.
 *
 * Agora o próprio `<html>` recebe `data-documento-astro` antes da primeira
 * pintura (script inline do layout raiz) e a cada navegação
 * (`MarcaDaAstro`). É da Astro:
 * - qualquer caminho de `RAIZES_DA_ASTRO`, em qualquer endereço;
 * - tudo no endereço só do painel (astroimob), MENOS as páginas de token
 *   que o cliente do corretor recebe: essas levam a marca do grupo.
 */
export const RAIZES_DA_ASTRO = ["/corretor", "/plataforma", "/astro", "/ajuda", "/auth"] as const;
export const ATRIBUTO_DA_ASTRO = "data-documento-astro";
/** A barra do Android antes de a página escolher a dela (`CorDaBarraDaAstro`). */
export const COR_DA_BARRA_DA_ASTRO = "#0f2547";

export function ehDocumentoDaAstro(caminho: string, noEnderecoDoPainel: boolean): boolean {
  if (RAIZES_DA_ASTRO.some((raiz) => caminho === raiz || caminho.startsWith(`${raiz}/`))) return true;
  return noEnderecoDoPainel && !ehRotaDeTokenDoCliente(caminho);
}

/**
 * O mesmo cálculo, como texto, para rodar antes da primeira pintura. Sem
 * `\\b`/`\\d` e sem template aninhado: atravessa TypeScript → HTML → JS.
 */
export function scriptDaMarcaDaAstro(enderecos: string[], rotasDeToken: readonly string[]): string {
  return `try{
  var h=document.documentElement,c=location.pathname,e=location.hostname.toLowerCase();
  var raizes=${JSON.stringify(RAIZES_DA_ASTRO)},tokens=${JSON.stringify(rotasDeToken)},painel=${JSON.stringify(enderecos)};
  var daAstro=raizes.some(function(r){return c===r||c.indexOf(r+"/")===0;});
  if(!daAstro&&painel.indexOf(e)>=0){
    daAstro=!tokens.some(function(r){return c.indexOf(r+"/")===0&&c.length>r.length+1;});
  }
  if(daAstro){
    h.setAttribute("${ATRIBUTO_DA_ASTRO}","");
    var mt=document.querySelector('meta[name="theme-color"]');
    if(mt)mt.setAttribute("content","${COR_DA_BARRA_DA_ASTRO}");
  }
}catch(x){}`;
}
