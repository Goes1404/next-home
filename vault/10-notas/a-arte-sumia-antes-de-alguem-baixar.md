---
title: A arte sumia antes de alguém baixar
aliases: [baixar arte de IA, galeria sem download, retenção de 48h da arte]
tags: [painel, licao]
type: nota
status: stable
custou: baixo
codigo:
  - src/lib/imagens/imagensTipos.ts
  - src/lib/imagens/galeria.ts
  - src/app/corretor/(painel)/imoveis/criar-imagem/ChatDeArte.tsx
  - src/app/corretor/(painel)/imoveis/_componentes/ArtesDeIA.tsx
created: 2026-09-16
updated: 2026-09-16
fonte: relato do usuário (16/09/2026) + medição no banco, no Storage e nos erros de runtime
summary: >-
  Não havia botão de baixar em lugar nenhum da galeria, e a seção inteira
  sumia quando a retenção de 48h esvaziava a lista.
---

# A arte sumia antes de alguém baixar

Relatado como *"atualmente não consigo ver os cards de minhas imagens, para
baixá-las"*. Eram **dois defeitos somados**, e o segundo escondia o primeiro.

## O que a medição mostrou, antes de tocar em código

Quatro causas possíveis pediam consertos opostos, e três se descartam em
minutos:

| hipótese | como conferi | resultado |
|---|---|---|
| a tela quebrou | erros de runtime da Vercel, 48h | **zero** nas rotas do painel |
| migration não aplicada | `select` na coluna | tudo no lugar |
| arquivo sumiu do Storage | `curl -I` na URL | HTTP 200, 1,7 MB |
| a galeria está vazia | `count(*)` | **1 linha na tabela inteira** |

A tabela inteira tinha **uma** arte, criada naquela noite. Todo o resto foi
levado pela retenção de 48h (0109) — que é deliberada, mas invisível.

## Os dois defeitos

1. **Não existia botão de baixar.** Um `grep` por `download|baixar` em todo o
   painel devolvia só o PDF do book. O card era uma miniatura de 80px em
   `object-cover`, sem link: para guardar a arte era preciso adivinhar o clique
   com o botão direito — e no celular, onde o painel é usado, segurar a imagem.
2. **A seção inteira sumia quando a lista esvaziava** (`galeria.length > 0 &&`).
   Sem estado vazio, a retenção não produzia uma lista vazia: produzia a
   AUSÊNCIA da seção. **Seção que some é indistinguível de recurso que não
   existe ou que quebrou** — foi exatamente assim que isto chegou como defeito.

## `<a download>` não funciona entre origens

A armadilha que decidiu a implementação: o atributo `download` do HTML é
**ignorado quando o arquivo vem de outra origem**, e a arte mora no domínio do
Storage. O botão navegaria para a imagem e a pessoa continuaria sem arquivo.

Quem resolve é o próprio Supabase: `?download=<nome>` faz ele responder com
`content-disposition: attachment`. **Medido contra o bucket real antes de
escrever** — o cabeçalho volta com o nome que mandamos. Servidor decidindo vale
em todo navegador e no celular, sem uma linha de JavaScript; a alternativa
(fetch + blob) faria o telefone segurar 2 MB de memória para chegar ao mesmo
lugar.

## O prazo é DATA, nunca "faltam X horas"

O card é renderizado no servidor E no cliente. Qualquer conta com o relógio
dentro do render produz valores diferentes nos dois lados — a divergência de
hidratação que esta base já pagou ao ler `localStorage` durante a renderização.
`quandoExpira` formata uma data, que é o mesmo texto nos dois lugares, com o
fuso de São Paulo cravado: em UTC, às 21h de Brasília já é o dia seguinte e a
arte pareceria durar um dia a mais.

## Régua

**Ao pôr prazo de validade em algo que a pessoa produz, entregar o caminho de
salvar na mesma mudança.** A retenção de 48h nasceu como decisão de custo e
estava certa; o que faltava era a saída. Recurso que expira sem caminho de
guardar transforma uma economia de bucket em trabalho perdido.

## Vizinhas

- [[arte-de-ia-nao-e-midia-do-catalogo]] — por que ela não entra em `midias`
- [[a-folga-encolhe-quando-a-tela-encurta]] — a outra medição desta semana que
  só reproduziu fora do caso feliz
