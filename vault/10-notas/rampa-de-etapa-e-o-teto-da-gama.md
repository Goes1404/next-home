---
title: A rampa de etapa não pode esquentar — o teto é a gama
aliases: [paleta das etapas, cores do funil]
tags: [painel, crm, medicao]
type: nota
status: growing
custou: medio
codigo:
  - src/app/globals.css
  - src/app/corretor/(painel)/_componentes/etapas.ts
  - scripts/verificarPaleta.mjs
created: 2026-09-09
updated: 2026-09-09
fonte: pedido do usuário ("não está bonito nem chamativo") + npm run paleta
summary: A rampa fazia o contrário do que prometia — quanto mais perto do dinheiro, mais escura e apagada. O conserto veio de luz, presença de chip e borda; croma crescente até o ciano é impossível em sRGB.
---
# A rampa de etapa não pode esquentar — o teto é a gama

## O que estava errado, medido

O comentário do `globals.css` prometia "a escala esquenta junto com a
negociação". A rampa fazia o oposto:

- croma **caía** 0.18 → 0.12 do primeiro ao último passo;
- no tema claro a luz **caía** 0.56 → 0.32: `documentacao` virava petróleo
  sujo, o passo mais valioso sendo o mais apagado da tela;
- no escuro, `documentacao` em L 0.91 chegava perto do branco;
- `lavado` a 0.10 no claro deixava todo chip **cinza** — a cor vivia só na
  tinta minúscula do texto.

E tudo isso **passava** em `npm run paleta`: a guarda mede contraste e
distância entre passos, não beleza. Guarda verde não é o mesmo que paleta boa.

## O teto que ninguém tinha registrado

A correção óbvia — croma crescente até o fim da rampa — **é impossível**. Em
sRGB o ciano tem teto de croma perto de 0.13; a queda de croma da versão
antiga não era descuido, era a GAMA. Uma rampa que esquenta de verdade
precisaria sair do arco frio, e lá fora esbarra em `alerta` (66°), que aparece
no MESMO cartão ("parado há N dias"). Etiqueta cor de alerta ao lado de texto
de alerta é pior que etiqueta apagada.

## O que resolveu

Presença, não matiz nova:

| | antes | depois |
|---|---|---|
| luz (claro) | 0.56 → 0.32 | 0.56 → 0.385 |
| luz (escuro) | 0.64 → 0.91 | 0.68 → 0.875 |
| `lavado` | 0.10 / 0.16 | 0.16 / 0.22 |
| `linha` | 0.28 / 0.36 | 0.45 / 0.50 |
| arco de matiz | 265→188 (77°) | 270→192 (78°, redistribuído) |
| passos (claro) | .080 / .098 / .105 | .085 / .091 / .093 |
| passos (escuro) | .111 / .114 / .108 | .101 / .098 / .084 |

Os passos ficaram **parelhos** em vez de irregulares — o primeiro passo do
claro estava a 6% do mínimo. E `fechado` virou o verde mais vivo do painel com
**etiqueta sólida**: entrada (`novo`) e vitória (`fechado`) são os dois
extremos e são os únicos que gritam; o meio do funil é lavado, porque se tudo
gritasse nada gritaria.

## Duas armadilhas do processo

- **Subir a luz no claro derruba o contraste do chip**, porque a mesma cor é
  a TINTA do texto e o preenchimento da régua. A primeira tentativa (luz
  0.58 → 0.475) reprovou em `contato` (3.85:1) e `visita` (4.09:1). No tema
  claro a rampa é obrigada a descer — o que dá para escolher é o quanto.
- **Matiz 180° lê como verde, não como turquesa.** Alarguei o arco até 180
  para ganhar distância entre passos e a régua de `documentacao` ficou
  indistinguível da de `fechado` no olho — só a captura de tela mostrou; os
  números aprovaram. Voltou para 192.

## Relacionadas
- [[quadro-do-funil-e-lateral-de-novo]]
- [[medir-producao-nao-confiar-em-parece-funcionar]]
- [[alerta-sempre-aceso-vira-paisagem]]
