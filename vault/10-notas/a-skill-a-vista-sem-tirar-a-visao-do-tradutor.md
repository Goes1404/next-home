---
title: A skill à vista, sem tirar a visão do tradutor
aliases: [duas sessões decidiram o contrário, o conflito que o git não acusa]
tags: [midia, painel, decisao]
type: nota
status: evergreen
custou: alto
codigo: [src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx, src/lib/imagens/receitas.ts]
created: 2026-09-16
updated: 2026-09-16
fonte: merge de 16/09/2026, com o trabalho de 13/09 parado no working tree
summary: Duas sessões tomaram decisões opostas sobre o tradutor de imagem — uma o removeu, outra lhe deu visão — e o git não acusou nada, porque a remoção nunca foi commitada. O desempate não foi escolher um lado: as duas queixas eram diferentes, e cada uma tinha seu conserto.
---
# A skill à vista, sem tirar a visão do tradutor

## O conflito que o git não podia acusar

Em **13/09** este working tree removeu o tradutor de prompt de imagem, a
pedido: *"isso de mudar o prompt dele está dando muito erro e resultados
ruins — deixe somente a conversa, sem muito segredo"*. `tradutor.ts`,
`gramatica.ts` e `engenheiroDePrompt.ts` foram apagados e a receita virou uma
**skill visível e trocável** na tela.

Em **15/09** outra sessão foi ao contrário: deu **visão** ao tradutor — ele
passou a olhar as fotos — e escreveu o `oficio.ts`. Ver
[[o-tradutor-passou-a-olhar-as-fotos]].

O git não marcou conflito nenhum, e a razão é a que importa: **a remoção
nunca foi commitada**. Ficou três dias no working tree. Só a MEMORIA que a
documentava subiu — e produção passou a ter um documento afirmando que o
tradutor saiu, e um tradutor maior do que antes.

> **Documento commitado sem o código que ele descreve é pior que documento
> nenhum.** Ele aponta o diagnóstico para o lugar errado, que é o defeito
> recorrente nº 5 desta base. Ao registrar uma remoção, commitar a remoção.

## As duas queixas não eram a mesma queixa

O desempate não foi escolher um lado. Relidas, as duas sessões consertavam
coisas diferentes:

| queixa | conserto |
|---|---|
| "os resultados são ruins" | ele era **cego** — recebia um booleano e era mandado descrever uma foto que não via (15/09) |
| "muito segredo" | a espinha entrava sem ninguém ver, escolhida por heurística (13/09) |

Visão conserta a primeira e não toca na segunda; skill à vista conserta a
segunda e não toca na primeira. **Antes de escolher entre dois consertos,
conferir se eles atacam o mesmo defeito** — quando não atacam, escolher é
jogar metade fora.

## O que ficou

O tradutor continua, com visão. A skill deixou de ser decidida em silêncio:

- A proposta apenas **sugere** a receita; o que vale é o que está marcado na
  tela.
- A espinha aparece por extenso atrás de `Ver o que a skill acrescenta`.
  Prompt que o corretor não lê é prompt que ele não corrige — a mesma régua
  que tirou o prompt em inglês de dentro de um `<p>`.
- Skill que exige foto não é oferecida sem foto: oferecer o que não funciona
  é pior que não oferecer.
- Os botões **quebram linha, nunca rolam**. Escolha atrás de um gesto que a
  fileira não anuncia é defeito já medido aqui.

O encaixe custou pouco porque a rota já fazia a parte cara: ela recebe
`receita` no corpo e junta a espinha por código em `montarPedido`, antes de
qualquer IA. Faltava só o corretor poder escolher.

## Régua de merge que fica

A outra sessão já tinha escrito metade disto: *depois de um merge, procurar a
DECISÃO que o outro lado tomou, não só as linhas que o git marcou*. A outra
metade é esta: **procurar também a decisão que o SEU lado tomou e não
commitou** — ela é invisível para o git dos dois lados, e some sem barulho.

Relacionadas: [[o-tradutor-de-prompt-de-imagem]],
[[o-tradutor-era-cego-e-inventava-a-cena]], [[referencia-no-chat-do-estudio]].
