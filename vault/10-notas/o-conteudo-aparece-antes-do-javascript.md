---
title: O conteúdo aparece antes do JavaScript
tags: [front, gsap, decisao]
type: nota
status: growing
custou: alto
codigo: [src/components/motion/estaNaTela.ts, src/components/motion/Reveal.tsx, src/components/motion/CartaoTilt.tsx, src/components/motion/TituloEditorial.tsx, src/components/motion/AberturaHome.tsx, src/components/motion/Preloader.tsx, src/app/globals.css, src/components/motion/conteudoVisivelSemJs.test.ts]
created: 2026-09-13
updated: 2026-09-13
fonte: F1 do docs/ROADMAP-PERFORMANCE.md; linha de base em docs/medicoes/2026-09-13-linha-de-base-performance.md
summary: O contrato `.gsap-pending` (nasce invisível, o GSAP revela) custava 10,6 s de LCP no celular. Invertido — nasce visível, só o que está FORA da tela na hidratação ganha entrada (`estaNaTela`); o hero chega por CSS; a vinheta é só desktop, 3,8 s, e rolar a dispensa.
---
# O conteúdo aparece antes do JavaScript

Fase 1 do [roadmap de performance](../../docs/ROADMAP-PERFORMANCE.md),
aplicada em 13/09/2026. A causa nº 1 da linha de base
([[o-site-e-lento-por-desenho-nao-por-peso]]).

## O contrato que existia, e por que parecia certo

Todo elemento animado nascia com `.gsap-pending` (`opacity: 0` no CSS) e o
GSAP o revelava ao assumir. O motivo era bom — evitar o FLASH do conteúdo
já posicionado antes de a animação começar — e tinha até rede de segurança
(`.no-js`, `.motion-off`, `intro-socorro` aos 12 s). O que ninguém mediu:
**no celular de referência o JavaScript leva ~10 s para chegar e hidratar**,
e durante esse tempo o hero inteiro, os cards e os títulos estavam no HTML
com opacidade zero. LCP de 10,6 s, 99% "atraso de renderização".

## O contrato novo

1. **Nasce visível.** Nenhum componente adiciona classe de opacidade zero no
   servidor. Se o JS nunca vier, a página é a página.
2. **Só o que está FORA da tela ganha entrada.** `estaNaTela(el)` na
   montagem: dentro da viewport → o componente não toca no elemento (Reveal),
   pula a cortina mas liga o tilt (CartaoTilt), pula o SplitText
   (TituloEditorial). Fora → esconde e anima ao entrar, como antes.
   Sem folga de propósito: um pixel na tela conta como visto — o erro é
   assimétrico (perder um efeito × sumir conteúdo debaixo do olho).
3. **O hero da home chega por CSS.** `@keyframes chegada` com `both`,
   escalonada por `data-abertura="0..4"` (`--ordem`), pausada só enquanto
   `data-intro-ativa` está no `<html>` — a queda do atributo a solta. Roda
   antes de qualquer script. `AberturaHome` ficou só com o recuo do fundo
   (efeito sobre ambiente, pode chegar tarde).
4. **A vinheta é só desktop, 3,8 s, e rolar a dispensa.** No celular o fundo
   da home já é ela (`fundo-home`); tocar duas vezes custava 0,7 MB e até
   9,5 s. 3,8 s é onde a logo fecha (menos que isso é o "soluço" que a versão
   de 4,2 s tinha); depois disso é só a marca crescendo. Um `<video>` em vez
   de dois (a cópia borrada era uma segunda decodificação no instante da
   hidratação) e `poster` de 12 KB — é o poster que o Chrome mede como LCP
   da primeira visita no desktop, em vez de tela em branco. O scroll não
   trava mais: `wheel`/`touchmove` encerram — a página já está pronta atrás.

## O que saiu junto

- `.gsap-pending`, `.no-js` (classe e script inline) e a cópia borrada do
  Preloader.
- O eixo `SOFT` da Fraunces: nenhuma regra o usava e a fonte pré-carregada
  em toda página pesava 118 KB.
- `fetchPriority="high"` explícito na capa dos cards com `prioridade`:
  `priority` do `next/image` só gerava o `<link rel=preload>`; o atributo no
  `<img>` faltava e o Chrome reprovava a listagem na checagem de LCP.

## A guarda

`conteudoVisivelSemJs.test.ts` lê o código: `.gsap-pending` fora do CSS e
das páginas públicas; `estaNaTela(el)` ANTES de `gsap.set`/`new SplitText`
nos três componentes de entrada; a chegada do hero em CSS com `both` e
pausada só sob a vinheta; `AberturaHome` sem opacidade; nenhuma página
pública com `opacity-0` fora de decoração. Provocada duas vezes com md5
conferido: `gsap-pending` de volta no Reveal e `gsap.set` antes do
`estaNaTela` no CartaoTilt — 1 falha cada.

## Como conferir
- `npm run perf -- --perfil=celular` antes e depois (o arquivo em
  `docs/medicoes/` leva a data e o modo).
- `MSYS_NO_PATHCONV=1` no Git Bash, senão `--paginas=/` vira
  `C:/Program Files/Git/`.

## Relacionadas
- [[o-site-e-lento-por-desenho-nao-por-peso]] — a linha de base
- [[gsap-armadilhas]] — dois donos da mesma opacidade continuam proibidos
- [[MOC — Front Público]]
