---
title: Pareamento depois de 401 recomeça a instância
aliases: [Não foi possível conectar o dispositivo, pareamento recusado, instance/delete, recomecar]
tags: [whatsapp, incidente]
type: incidente
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/pareamento.ts
  - src/lib/whatsapp/provider.ts
  - src/lib/whatsapp/pareamentoRecusado.ts
  - src/lib/whatsapp/pareamentoRecomeco.test.ts
  - src/app/corretor/(painel)/whatsapp/acoes.ts
  - src/app/corretor/(painel)/whatsapp/_componentes/PainelConexao.tsx
created: 2026-10-27
updated: 2026-10-27
fonte: print do celular do Ramos ("Não foi possível conectar o dispositivo"), 27/10/2026
summary: Depois de o WhatsApp tirar o número da conta (401), todo pedido de código do Ramos terminou em 401; a instância em close passou a ser apagada e recriada antes do pareamento, e a tela avisa quando o WhatsApp recusa o aparelho.
---
# Pareamento depois de 401 recomeça a instância

## O que aconteceu

O Ramos tentou reconectar o número em 27/10, das 16h28 às 16h59, e o celular
respondeu "Não foi possível conectar o dispositivo. Confira se você inseriu o
número de telefone correto…". Nos logs, cinco quedas da instância
`nexthome-ramos`: 401 às 19h28, 19h29, 19h33, 19h55 e 19h59 UTC, e uma 428 às
19h51. Às 19h55 a Evolution nem devolveu código (`estado=? temQr=false`) e a
instância caiu com 401 **0,4 s depois do pedido**.

Leitura: a instância guardava a sessão do aparelho que o WhatsApp tinha
desconectado em 21/10 ([[primeiro-contato-tem-teto-proprio]]). Com a
instância em `close`, o pedido de código seguia direto (`seguir`), a Evolution
abria o socket com as credenciais velhas, e o WhatsApp recusava. A causa não
foi provada lá dentro: a URL e a chave da Evolution não estão acessíveis desta
sessão.

## O que mudou

- `close` agora é `recomecar` (`pareamento.ts`): a instância é apagada
  (`DELETE /instance/delete`) e recriada com o mesmo nome e o mesmo webhook,
  nos dois métodos (código e QR). Se a Evolution ainda estiver apagando, o
  `create` tenta de novo 2 s depois. Número conectado (`open`) nunca é
  apagado; QR pendente (`connecting`) continua com logout.
- A tela para de esperar quando o WhatsApp recusa o aparelho: queda 401/403
  registrada mais de 5 s depois de o código aparecer vira a frase
  `FRASE_RECUSADO_PELO_WHATSAPP` (`pareamentoRecusado.ts`). Só vale para número
  que já tinha conectado antes: a queda de número novo não é registrada.

## Se continuar recusando

O WhatsApp pode bloquear aparelhos novos por um tempo depois de uma
restrição. Nesse caso nada do nosso lado resolve: conectar pelo QR Code (painel
num computador, leitura pelo celular) ou esperar algumas horas.

Ligações: [[pareamento-fetch-failed-na-primeira-conexao]],
[[queda-do-numero-pausa-a-lista-e-diz-o-motivo]].
