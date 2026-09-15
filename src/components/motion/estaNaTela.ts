/**
 * O elemento já está (ao menos em parte) dentro da viewport neste instante?
 *
 * É a pergunta que decide se um componente de entrada (Reveal, CartaoTilt,
 * TituloEditorial) pode ESCONDER o conteúdo para animá-lo depois. A regra da
 * casa desde 13/09/2026: o servidor entrega tudo visível, e o JavaScript só
 * anima o que o visitante ainda não viu. Esconder o que está na tela para
 * revelar de novo é piscar — e, na primeira carga, foi o que fez o LCP do
 * celular chegar a 10,6 s: o hero nascia com `opacity: 0` e esperava o
 * GSAP hidratar para aparecer.
 *
 * Sem folga de propósito: elemento com um pixel na tela conta como visto.
 * O erro é assimétrico — não animar um cartão que estava na borda custa um
 * efeito; escondê-lo custa conteúdo sumindo debaixo do olho de quem lê.
 */
export function estaNaTela(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}
