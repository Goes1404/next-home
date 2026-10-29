/**
 * O CRM com jeito de APP quando aberto pelo app instalado (29/10/2026).
 *
 * Relato: "parece que o app está literalmente como um site: se eu arrastar
 * para baixo ele atualiza". O app da Play Store é o CRM numa janela do Chrome
 * sem barra (Trusted Web Activity), então herdava o que é de navegador: puxar
 * para atualizar, zoom com dois dedos, menu ao segurar um link, seleção de
 * texto ao segurar um botão, o lampejo azul ao tocar e a página do dinossauro
 * sem internet.
 *
 * Tudo isso só muda no app instalado (`display-mode: standalone`); no
 * navegador comum o site segue igual. O script roda ANTES da primeira
 * pintura (inline) e marca `data-app` no <html>; as regras de CSS estão em
 * `globals.css` ("O CRM com jeito de app"). Depois ele:
 *
 * - trava o zoom pela meta viewport (o Android ainda respeita o "forçar zoom"
 *   da acessibilidade, que passa por cima disto);
 * - cancela o menu de "abrir em nova aba / copiar link" ao segurar um link ou
 *   uma imagem — campos de texto continuam com o menu normal;
 * - registra o service worker do painel (`sw-painel.js`), que mostra a tela
 *   "sem conexão" da Astro no lugar da página do Chrome. Ele já era o das
 *   notificações; registrar de novo é idempotente.
 */
export const SCRIPT_DE_APP = `try{
  var app=window.matchMedia&&(matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches);
  if(app){
    var h=document.documentElement;
    h.setAttribute("data-app","sim");
    var v=document.querySelector('meta[name="viewport"]');
    if(v)v.setAttribute("content","width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    document.addEventListener("contextmenu",function(e){
      var t=e.target;
      if(t&&t.closest&&!t.closest("input,textarea,[contenteditable],.selecionavel")&&t.closest("a,img,button,[role=button]"))e.preventDefault();
    });
    if("serviceWorker" in navigator){
      window.addEventListener("load",function(){navigator.serviceWorker.register("/sw-painel.js",{scope:"/corretor/"}).catch(function(){});});
    }
  }
}catch(e){}`;

export function ComportamentoDeApp() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_APP }} />;
}
