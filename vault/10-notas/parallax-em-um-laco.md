---
title: O parallax do site roda em UM laço, com fase de leitura e fase de escrita
aliases: [controladorCamadas, Camada]
tags: [gsap, front, arquitetura, medicao]
type: nota
status: evergreen
custou: alto
codigo: [src/components/motion/FundoEmCamadas.tsx, src/components/motion/camadasCalculo.test.ts, src/components/motion/camadasGuardas.test.ts, src/components/motion/Camada.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Parallax e camadas (24/08/2026)
summary: ~40 camadas em um laço (não um ScrollTrigger cada), leitura antes de escrita, sem scale por padrão, e fixed não serve de referência de scroll. Medido — 16,7 ms/quadro mediana.
---
# O parallax roda em um laço

`controladorCamadas.ts`, não um `ScrollTrigger` por componente: com ~40
camadas, o padrão antigo daria 60–90 gatilhos recalculando a cada `refresh`.
A matemática vive separada e testada em `camadasCalculo.ts`, sem DOM.

**Medido depois de pronto**: mediana de 16,7 ms por quadro (60fps), p95 de
18,4 ms, zero quadro acima de 50 ms rolando a home inteira.

## Regras do laço

- **Fase de LEITURA e fase de ESCRITA, nessa ordem** — intercalar
  `getBoundingClientRect` com escrita de transform força relayout. `aoAtualizar`
  roda na fase de escrita e não pode ler layout.
- **`position: fixed` NÃO SERVE de referência de scroll** — o retângulo é
  sempre a viewport, o progresso dá zero para sempre. Foi assim que a capa do
  hero nasceu parada (só apareceu medindo o `transform` no navegador). A
  `CapaHero` registra um MEDIDOR irmão (`absolute inset-0`, que rola com a
  seção).
- **O controlador não escreve `scale` por padrão** — escrever `1` todo frame
  sobrescrevia o `scale-110` das molduras e o `style={{scale}}` do
  `ParallaxImagem`. `scale` só sai para quem passou `escala`.
- **Onde o conteúdo é alvo de clique, quem se move é o FUNDO**
  (`FundoEmCamadas`): chip de região e item de lazer não saem do lugar. A
  seção precisa de `overflow-hidden`.
- `camadasGuardas.test.ts` reprova camada em mapa, player, formulário e
  navegação ([[testes-que-leem-o-codigo]]).

## Medição de overflow em viewport emulado

15px são a barra de rolagem, não conteúdo: `clientWidth` 375 num viewport de
390 é a scrollbar clássica do Chromium headless. Só acuse o layout depois de
esconder o suspeito e remedir.

## Relacionadas
- [[gsap-armadilhas]]
- [[video-controlado-por-scroll-precisa-de-keyframes-densos]]
