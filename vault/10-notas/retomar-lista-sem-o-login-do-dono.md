---
title: Retomar uma lista sem o login do dono
aliases: [retomarLista, retomar-lista.yml, retomar lista pelo Actions]
tags: [campanhas, infra, runbook]
type: runbook
status: growing
custou: baixo
codigo:
  - scripts/ops/retomarLista.ts
  - scripts/ops/retomar-lista.json
  - .github/workflows/retomar-lista.yml
  - src/app/corretor/(painel)/campanhas/acoes.ts
created: 2026-10-09
updated: 2026-10-09
fonte: pedido de retomar a lista do Ramos (09/10/2026), numa sessão sem acesso ao banco
summary: O botão "Retomar" só funciona com o login do dono da lista. Sem ele, troque o id em scripts/ops/retomar-lista.json e suba na branch de produção; o GitHub Actions retoma com a chave de serviço, fazendo o mesmo que o botão. Fora da janela, só retoma lista que não manda a qualquer hora.
---

# Retomar uma lista sem o login do dono

`retomarCampanha` filtra pelo corretor da sessão (`mudarEstadoDaLista`): nem o
ADM retoma a lista de outro pelo painel. Quando o dono não pode tocar no botão
e a sessão do Claude não tem o banco, o caminho é o Actions, que tem a chave de
serviço nos secrets (a mesma do worker de vídeo e das fotos do catálogo).

## Passo a passo

1. Em `scripts/ops/retomar-lista.json`, coloque o `campanhaId` e uma frase em
   `pedido` (quem pediu e por quê; vai para `admin_eventos`).
2. Suba na branch `claude/modernizar-plataforma-imobiliaria-2tm13q`. O
   workflow **Retomar lista de transmissão** roda sozinho.
3. Confira o log da execução: estado da lista, pendentes, próximo horário, o
   número do corretor (conectado? pausado pelo disjuntor?) e se a fila anda
   agora ou às 9h.

## O que ele faz

O mesmo que o botão, na mesma ordem: sinais de hoje viram a base da pausa
automática (0172), a lista volta a `em_andamento` só se ainda estiver
`pausada`, e a conferência de texto recomeça (contadores e motivos de texto
zerados). Grava `admin_eventos` com `acao = 'lista_retomada'`.

## Horário

Retomar de noite é seguro: o disparador só manda das 9h às 20h59 (e no
expediente do corretor). A exceção é a lista marcada para "qualquer hora"
(`ignorar_janela` ou `janela_liberada_ate` no futuro): fora da janela o script
se recusa a retomá-la, porque ela mandaria de madrugada.

## Relacionadas

- [[lista-de-transmissao-visivel-e-controlavel]]
- [[texto-da-lista-conferido-antes-de-sair]]
- [[fluxo-de-campanhas]]
