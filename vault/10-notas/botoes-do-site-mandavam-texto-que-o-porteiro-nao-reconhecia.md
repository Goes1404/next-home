---
title: Os botões do site mandavam um texto que o porteiro não reconhecia
aliases: [mensagem do site, Vim pelo site, visitante novo ignorado]
tags: [whatsapp, licao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/mensagensDoSite.ts, src/lib/whatsapp/porteiro.ts, src/lib/whatsapp/botoesDoSite.test.ts]
created: 2026-09-28
updated: 2026-09-28
fonte: merge de 28/09/2026, leitura dos 13 pontos de WhatsApp do site
summary: Desde a 0111, número sem lead só entra no CRM se a primeira fala for convite reconhecido. Os botões do site mandavam "Olá, Bruna! Vim pelo site…", que o porteiro não reconhece — o visitante novo escrevia e era ignorado, calado. Hoje todo botão usa mensagemDoSite / mensagemDeAnuncio, e uma guarda lê o código.
---
# Botões do site × porteiro

## O defeito

A 0111 fez o webhook ignorar número sem lead cadastrado, a menos que a
primeira fala seja um convite nosso (`reconhecerConviteDeEntrada`). O
reconhecedor conhecia o texto do anúncio e, depois, `MENSAGEM_DO_SITE`.

Nenhum botão do site mandava esses textos. Hero, contato, rodapé, cartão do
corretor, mapa, book, localização: cada um montava a própria frase
("Olá, Bruna! Vim pelo site e quero…"). O visitante que ainda não era lead
clicava, enviava e **o webhook o descartava sem conversa, sem resposta e sem
rastro**. Tipos, testes e build verdes; o botão abre o WhatsApp normalmente.

## A correção

- Com imóvel no contexto: `mensagemDeAnuncio(nome, intencao)`. O porteiro
  reconhece e já traz o imóvel.
- Sem imóvel: `mensagemDoSite()`.
- As duas moram em `mensagensDoSite.ts`, módulo puro. Importá-las de
  `porteiro.ts` puxava o reconhecedor e o `modoBot` para as rotas do painel
  via `site.ts` (a catraca de bundle acusou). O porteiro reexporta.
- Custo aceito: a mensagem deixa de cumprimentar o corretor pelo nome.

`botoesDoSite.test.ts` reprova qualquer "Vim pelo site" escrito à mão no
site público. Provocada: reprova.

Ver [[migration-aplicada-fora-da-branch-e-apagada-pela-outra]].
