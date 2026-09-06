---
title: GSAP — as armadilhas conhecidas deste projeto
aliases: [twMerge text-fluid, Flip.fit, gsap-pending, no-js]
tags: [gsap, front, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/components/motion/Reveal.tsx, src/lib/utils.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Front público, GSAP
summary: twMerge descarta text-fluid-*; Flip entre elementos diferentes exige Flip.fit; dois donos da mesma opacidade somem o elemento; .no-js precisa de quem aplique a classe.
---
# GSAP: armadilhas conhecidas

- **`twMerge` (o `cn`) descarta os utilitários `text-fluid-*`.** Ele não os
  conhece e, ao ver um `text-<cor>` junto, considera conflito e joga o tamanho
  fora — o título do hero saía com 17px em vez de 120px. Componentes que
  recebem `className` com escala fluida juntam as classes cru
  (`[a, b].filter(Boolean).join(" ")`), não com `cn`.
- **`Flip` entre elementos DIFERENTES precisa de encaixe explícito.**
  `Flip.getState(miniatura)` + `Flip.from({targets: palco})` não funciona: o
  Flip só casa o mesmo elemento ou o mesmo `data-flip-id`. A sequência que
  funciona: `Flip.fit(palco, origem)` → `getState(palco)` → `clearProps` →
  `Flip.from(estado)`.
- **Dois donos da mesma opacidade fazem o elemento sumir.** Item conduzido por
  timeline de abertura não pode estar dentro de um `Reveal`. Quem usa o
  contrato `.gsap-pending` precisa REMOVER a classe ao assumir.
- **A regra `.no-js .gsap-pending` existia sem ninguém aplicar a classe** —
  sem JavaScript, todo conteúdo animado ficava `opacity: 0` para sempre. O
  contrato correto: o `<html>` nasce `no-js` e o primeiro script inline
  remove.
- **`Camada` e `Reveal` nunca no mesmo nó** — os dois escrevem transform.
  Padrão: `<Camada><Reveal>…</Reveal></Camada>`. Onde entra `CartaoTilt`, o
  `Reveal` SAI (o tilt já assume a opacidade, cortina de clip-path).

## Relacionadas
- [[parallax-em-um-laco]]
- [[backdrop-filter-cria-containing-block]]
