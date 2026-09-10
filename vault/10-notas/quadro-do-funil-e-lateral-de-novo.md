---
title: O quadro do funil voltou a ser lateral
aliases: [kanban do funil, colunas do funil]
tags: [painel, crm, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/funil/Quadro.tsx
  - src/app/corretor/naoRolaDeLado.test.ts
created: 2026-09-09
updated: 2026-09-09
fonte: pedido do usuário em 09/09/2026 + medição com o CSS de produção
summary: O funil voltou a ser kanban de colunas laterais em toda tela — inclusive celular. Os três motivos que o derrubaram em 02/09 continuam válidos e cada um ganhou uma resposta; a rolagem lateral virou exceção DECLARADA na guarda.
---
# O quadro do funil voltou a ser lateral

## Contexto

Em 02/09/2026 o kanban de seis colunas virou uma **lista empilhada** por
etapa, por três motivos medidos: distribuição torta (perdido 62, primeiro
contato 46, quatro colunas quase vazias), rolagem lateral que não se anuncia
em 360px, e arrastar do HTML5 que **não funciona em toque**.

Em 09/09/2026 o usuário pediu o contrário: colunas laterais. O empilhamento
lia bem, mas perdia o que o kanban É — a etapa como EIXO, a carteira inteira
de relance — e transformava o quadro numa segunda lista.

## Decisão

Colunas laterais **em toda tela**, inclusive no celular. Cada motivo antigo
segue válido como motivo e ganhou resposta:

| motivo de 02/09 | resposta de 09/09 |
|---|---|
| distribuição torta | coluna VAZIA encolhe (`w-40`); cheia fica em `78vw` |
| rolagem que não se anuncia | coluna a 78vw faz a PRÓXIMA espiar na borda |
| arrastar não pega em toque | arrastar por **pointer events**, não HTML5 |

Cada coluna **rola por dentro** e não tem teto de cartões: 46 pessoas cabem
na coluna em vez de empurrar a página, que era o que o empilhamento não sabia
fazer. O teto que sobra é o da consulta (`TETO_DO_QUADRO`, 300) e o rodapé da
coluna manda para a lista quando ele corta.

O arrastar é **atalho, nunca a única porta**: o botão de avançar e o seletor
"Mover para" continuam em cada cartão, porque são eles que funcionam no
teclado e no leitor de tela. Só a alça (⠿) leva `touch-none` — o resto do
cartão continua rolando a coluna com o dedo.

## Medido com o CSS de produção

Reprodução da marcação real fora do login (o painel exige sessão), com o
maior `.css` de `.next/static/chunks` **embutido em `<style>`** — via `<link
file://` o CSS não carrega e a medição aprova qualquer coisa
([[medir-producao-nao-confiar-em-parece-funcionar]]):

| viewport | coluna | espia da próxima | coluna vazia | página rola de lado |
|---|---|---|---|---|
| 320 | 250px | 26px | 160px | não |
| 360 | 281px | 35px | 160px | não |
| 390 | 288px | 58px | 160px | não |
| 1280 | 288px | coluna inteira | 160px | não |

Quem rola é a FAIXA, nunca o documento. Todo alvo tocável ≥44px (a alça é
44×40 por margem negativa, como a pílula de reação do Live Chat). Coluna a
`68svh`, corpo rolando por dentro nas cheias.

## Alternativas descartadas

- **Colunas só no desktop, empilhado no celular**: preservaria a decisão de
  02/09 inteira, mas o pedido era a tela, não a versão grande dela.
- **Manter o teto de 6 cartões por coluna**: com coluna que rola por conta
  própria o teto deixa de resolver algo — ele existia porque, empilhado,
  46 cartões viravam dez mil pixels de página.
- **Arrastar do HTML5**: o motivo pelo qual o quadro antigo tinha um gesto
  que metade dos aparelhos não alcança.

## Consequências

- `naoRolaDeLado.test.ts` ganhou o quadro como exceção **declarada** e a
  lista mudou de nome: `TABELAS_LARGAS` → `ROLAGEM_DECLARADA`. A régua não é
  "é tabela?", é **"a rolagem é o conteúdo ou é alvo escondido?"**. Guarda
  provocada com dente antes de entrar (tirar a entrada reprova o arquivo).
- O fantasma que acompanha o dedo é `fixed` e mora FORA das colunas — dentro
  o `overflow-y-auto` o cortaria. Sem portal: nenhum ancestral do quadro tem
  `backdrop-filter` nem `transform`, só `isolate`, que não cria containing
  block ([[backdrop-filter-cria-containing-block]]).
- Soltar fora de qualquer coluna é DESISTIR — o banco não é tocado.
- Arrastar para coluna fora da tela exige autoscroll de borda em `rAF`: com o
  dedo parado não chega `pointermove` nenhum.

## Relacionadas
- [[navegacao-do-painel-tem-regua]]
- [[painel-paginado-no-banco]]
- [[contar-e-listar-sao-consultas-diferentes]]
- [[testes-que-leem-o-codigo]]
- [[backdrop-filter-cria-containing-block]]
