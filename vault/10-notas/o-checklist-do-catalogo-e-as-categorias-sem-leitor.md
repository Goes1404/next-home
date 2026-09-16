---
title: O checklist do catálogo, e as quatro categorias que ninguém lê
aliases: [completude do catálogo, visão 360 das categorias, seo_titulo morto]
tags: [painel, midia, decisao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/imoveis/completudeDoCatalogo.ts, src/app/corretor/(painel)/imoveis/_componentes/ChecklistDoCatalogo.tsx, src/app/corretor/(painel)/imoveis/_componentes/ChecklistDoImovel.tsx]
created: 2026-09-16
updated: 2026-09-16
fonte: medição do catálogo de produção em 16/09/2026, 26 imóveis
summary: Antes de desenhar o checklist, medir quais categorias existem revelou que quatro delas não são lidas por arquivo nenhum. Pedir ao corretor que preencha campo sem leitor é trabalho com efeito zero, e é o tipo de item que ensina a ignorar a lista inteira.
---
# O checklist do catálogo

O pedido foi "um checklist das coisas cadastradas, para ter visão 360 das
categorias presentes nos imóveis". O que mudou o desenho não foi a interface:
foi medir, antes, quais categorias existem e quais têm efeito.

## Quatro categorias não têm leitor nenhum

Medido no código em 16/09/2026, varrendo quem lê cada coluna:

| campo | quem lê |
|---|---|
| `seo_titulo` | **nenhum arquivo** |
| `seo_descricao` | **nenhum arquivo** |
| `iptu` | só o editor e o mapper |
| `condominio_valor` | só o editor e o mapper |

O título da página é gerado de nome mais cidade em `lib/seo.ts`; IPTU e
condomínio não aparecem no site nem no prompt, e `semValores.ts` cortaria o
número se a assistente tentasse dizer.

> **Antes de pedir que alguém preencha um campo, procurar quem o LÊ.** Campo
> sem leitor é trabalho com efeito zero, e numa lista de conferência ele é
> pior que inútil: é um item que nunca fica verde e ensina a ignorar a lista.

As quatro ficaram de fora, com o motivo escrito no módulo. O dia em que uma
delas ganhar leitor, o comentário explica por que hoje não está.

## Duas faixas, porque cobrar tudo é não cobrar nada

**Essencial** é o que a assistente usa ou o cliente vê, e só ele conta na
completude. **Complementar** aparece sem cobrança, para o corretor saber que
dá para preencher.

A régua da casa diz que degrau que vive em zero ensina a ignorar a lista, e
foi por isso que foto ficou fora do cartão de pendências. Aqui foto ENTRA, e
a razão é que aquele zero era artefato: ele foi medido só sobre o publicado.
Rascunho novo nasce sem foto e sem descrição, e é o rascunho que este
checklist existe para completar. **Ao aplicar uma régua antiga, conferir
sobre qual população ela foi medida.**

## Uma conta só, com guarda

`pendenciasDoCatalogo` respondia "tem planta?" por conta própria. Com o
módulo novo ao lado seriam duas implementações da mesma pergunta, e elas
divergem no primeiro ajuste — o defeito que esta base registra desde
`montarResumo`. Hoje a tela de pendências deriva do módulo, e há guarda de
código-fonte exigindo isso: ela foi provocada removendo a derivação, e a
mordida foi conferida por md5.

## Sem matriz, e com teto

A tentação era uma grade de 26 imóveis por 15 categorias. Não cabe em 360
pixels, e rolagem lateral fora de conteúdo declarado é o que esta base proíbe
desde a reforma de bolso. Dois blocos resolvem: um por CATEGORIA, que
responde onde o catálogo está fraco, e um por IMÓVEL, que responde por onde
começar.

O teto de seis abertos veio do dado, não do gosto: **zero dos 26 imóveis têm
o essencial completo**, então sem teto a lista abriria com 26 linhas.

## O que só apareceu OLHANDO

A medição aprovou tudo — sem rolagem lateral, sem texto cortado, alvos acima
de 44px nos dois temas e em 320, 360 e 390. A captura de tela reprovou um
detalhe que nenhum número pega: a explicação de cada categoria estava
truncada no meio da palavra. Ela é o PORQUÊ, e cortada não ensina nada.
Passou a quebrar linha. **Medir aprova, olhar reprova: precisa dos dois.**

Relacionadas: [[a-lista-de-pendencias-do-catalogo]],
[[a-planta-se-cadastrava-colando-uma-url]].
