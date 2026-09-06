---
title: Globo da home (cobe) — o que custou calibrar
aliases: [GloboImoveis, phi meio giro]
tags: [mapa, front, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/components/mapa/GloboImoveis.tsx, src/components/mapa/GloboOuMapa.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Globo do mapa da home
summary: O cobe injeta DOIS divs sem classe que quebram medida; globo claro sobre página clara some; phi precisou de -PI/2; keyframe não pode repetir o transform de posicionamento.
---
# Globo da home (cobe)

- **O cobe injeta DOIS divs sem classe** entre o container e o canvas (âncoras
  dos marcadores). Medir `canvas.parentElement` dá número errado e
  `justify-center` não centraliza. Medir a moldura por ref e posicionar o
  canvas em absoluto.
- **Globo claro sobre página clara SOME.** Clarear a esfera no tema claro
  virou um disco lavado sem contorno. O que dá destaque é contraste: a esfera é
  escura nos dois temas.
- **Phi precisou de meio giro a oeste** (`- PI/2`), calibrado em tela: com a
  conversão direta o Brasil nascia de perfil na borda direita.
- **Keyframe de rotação não pode repetir o transform de posicionamento** — o
  `@keyframes girar` trazia `translate(-50%,-50%) rotateX(...)` e sobrescrevia
  o posicionamento, jogando os anéis de órbita para fora. O pai posiciona e
  inclina; o filho só gira.
- **Camadas decorativas em volta de elemento quadrado se ancoram na ALTURA** —
  na largura, o halo saía com 867px contra 436px do globo.
- O contexto WebGL entra no orçamento dos painéis de vidro (`orcamentoWebgl`):
  sem vaga o globo não monta e o mapa entra direto.

## Relacionadas
- [[mapas-leaflet-armadilhas]]
