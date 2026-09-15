---
title: O pedido do corretor é o que vai — o tradutor de prompt saiu
aliases: [tradutor de imagem removido, skill de imagem, sem reescrita de prompt]
tags: [painel, decisao]
type: nota
status: evergreen
custou: medio
codigo:
  - src/lib/estudio/turno.ts
  - src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx
  - src/lib/imagens/receitas.ts
created: 2026-09-13
updated: 2026-09-13
fonte: relato do usuário em 13/09/2026 — "isso de mudar o prompt dele está dando muito erro e resultados ruins"
summary: O chat de arte parou de perguntar e de reescrever o pedido; o texto do corretor vai literal, e a receita virou skill que ele escolhe e vê.
---
# O pedido do corretor é o que vai

Relatado assim: *"deixe somente a conversa com o chatgpt sem muito segredo,
pois isso de mudar o prompt dele está dando muito erro e resultados ruins"*.

## O que havia entre ele e o gerador

Quatro camadas, e ele só enxergava a última:

| camada | o que fazia |
|---|---|
| `perguntarOQueFalta` | até 3 perguntas com chips antes de propor |
| `traduzirPedido` | **um LLM trocava o texto dele por outro** (12 s de espera) |
| `montarPedido` | anexava a espinha da receita, escolhida por heurística |
| `carimbarRessalva` | escreve "imagem ilustrativa" na peça (continua) |

A segunda é a queixa, e ela se defende mal: quando o motor falhava, a tela
tinha de **confessar** que o texto não era o prometido ("Não consegui melhorar
seu pedido agora"). Um caminho cujo melhor desfecho é devolver o que a pessoa
já havia escrito — e cujo pior é devolver coisa pior, com 12 s a mais — não
merece ficar no meio.

## A regra agora

**O que ele escreveu é o que vai.** `turnoDeArte` propõe direto, e
`prompt = ideia.trim()`. Zero chamada de LLM no caminho da arte.

## A receita virou SKILL, e skill não reescreve

Decisão do usuário, na própria resposta: *"a receita só vai add skills dentro
do prompt, como por exemplo a skill /design /marketing — não irá alterar o
prompt, só add essas skills"*.

Então: a proposta apenas SUGERE a skill (heurística determinística, sem LLM),
a tela mostra os chips, e o que vale é o que está marcado. A espinha continua
entrando num lugar só — `montarPedido`, na rota — e o cartão traz
"Ver o que a skill acrescenta" com o texto por extenso.

**Sem segredo é requisito, não gentileza**: prompt que o corretor não lê é
prompt que ele não corrige. Era esse o defeito da versão em inglês dentro de
um `<p>`, e ele voltaria por outra porta se a espinha ficasse invisível.

## O que se perdeu, declarado

`fatosDoImovelCitado` injetava a ficha do imóvel no prompt sem ele ver — saiu
junto. O diferencial sobre um chat genérico que **fica** são as FOTOS do
imóvel, que ele escolhe na faixa do cartão. Escolher é melhor que receber
embutido.

## Régua

- **Camada que só pode entregar o que já existia, ou coisa pior, não é
  camada: é risco com custo.** Medir isso é perguntar qual é o melhor
  desfecho dela, não o pior.
- **Ao remover um mecanismo por decisão de produto, as guardas dele são
  REESCRITAS para a invariante nova** — nunca apagadas. As duas de
  `estudio.test.ts` passaram a afirmar que o prompt sai do corretor e que
  nenhum LLM entra no caminho da arte.

## Relacionadas

- [[o-tradutor-de-prompt-de-imagem]]
- [[a-resposta-de-chip-era-jogada-fora]]
- [[a-ressalva-legal-volta-por-codigo]]
- [[MOC — CRM e Painel]]
