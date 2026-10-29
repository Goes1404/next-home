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
 * - dá um toque de vibração curtinho (8 ms) ao tocar na navegação, num botão
 *   de enviar, numa aba ou num seletor — o "clique" que todo app nativo tem
 *   (29/10/2026). Aparelho sem vibração (ou iPhone) só ignora;
 * - (em qualquer navegador) cobre a tela com o véu da Astro ao enviar um
 *   `<form data-sair>` — a saída animada da conta (29/10/2026) — e manda o
 *   service worker apagar os dados do app sem internet (`limpar-dados`;
 *   a tela de login manda de novo, ver `LimparSaida`);
 * - registra o service worker do painel (`sw-painel.js`), que mostra a tela
 *   "sem conexão" da Astro no lugar da página do Chrome. Ele já era o das
 *   notificações; registrar de novo é idempotente.
 */
export const SCRIPT_DE_APP = `try{
  document.addEventListener("submit",function(e){
    var f=e.target;
    if(f&&f.hasAttribute&&f.hasAttribute("data-sair")){
      document.documentElement.setAttribute("data-saindo","");
      try{var c=navigator.serviceWorker&&navigator.serviceWorker.controller;if(c)c.postMessage({tipo:"limpar-dados"});}catch(x){}
    }
  },true);
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
    if(navigator.vibrate){
      document.addEventListener("click",function(e){
        var t=e.target;
        if(t&&t.closest&&t.closest('nav a,nav button,button[type="submit"],[role="tab"],[role="radio"],[data-vibrar]'))try{navigator.vibrate(8);}catch(x){}
      },true);
    }
    if("serviceWorker" in navigator){
      window.addEventListener("load",function(){navigator.serviceWorker.register("/sw-painel.js",{scope:"/corretor/"}).catch(function(){});});
    }
  }
}catch(e){}`;

/**
 * A cor da barra de status (29/10/2026): "desvincule as cores da Next".
 *
 * No app, a barra do Android (relógio, bateria) é pintada pelo
 * `<meta name="theme-color">`. O layout raiz e o seletor de tema escrevem
 * nela as cores do SITE da Next Home (`COR_DA_BARRA`: sálvia no claro,
 * verde-quase-preto no escuro), então o app abria com uma faixa esverdeada
 * no topo.
 *
 * Este script corrige para o fundo do PAINEL da Astro, e segue corrigindo:
 * observa a troca de tema no `<html>`, a própria meta (o seletor a
 * reescreve) e a troca de tela (o login tem o céu marinho; a tela diz a cor
 * que quer em `data-cor-da-barra`). Só age em `/corretor` e `/plataforma`.
 * Roda no navegador comum também: lá a barra do Chrome usa a mesma meta.
 */
export const COR_DA_BARRA_DO_PAINEL = { claro: "#e3e8f1", escuro: "#070c16" } as const;
export const COR_DA_BARRA_DO_ACESSO = "#08132a";

export const SCRIPT_DA_BARRA = `try{(function(){
  var C={claro:"${COR_DA_BARRA_DO_PAINEL.claro}",escuro:"${COR_DA_BARRA_DO_PAINEL.escuro}"};
  var h=document.documentElement,pendente=false;
  function alvo(){
    if(!/^[/](corretor|plataforma)([/]|$)/.test(location.pathname))return null;
    var b=document.querySelector("[data-cor-da-barra]");
    if(b)return b.getAttribute("data-cor-da-barra");
    return h.getAttribute("data-tema")==="escuro"?C.escuro:C.claro;
  }
  function aplicar(){
    pendente=false;
    var c=alvo();if(!c)return;
    var m=document.querySelector('meta[name="theme-color"]');
    if(m&&m.getAttribute("content")!==c)m.setAttribute("content",c);
  }
  function agendar(){if(!pendente){pendente=true;requestAnimationFrame(aplicar);}}
  aplicar();
  var o=new MutationObserver(agendar);
  o.observe(h,{attributes:true,attributeFilter:["data-tema"]});
  o.observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:["content"]});
  function corpo(){if(document.body)o.observe(document.body,{childList:true,subtree:true});agendar();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",corpo);else corpo();
})()}catch(e){}`;

export function ComportamentoDeApp() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_APP }} />
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DA_BARRA }} />
    </>
  );
}
