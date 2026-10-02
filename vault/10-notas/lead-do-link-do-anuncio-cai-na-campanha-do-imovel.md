---
title: O lead do link do anúncio cai sozinho na campanha do imóvel
tags: [campanhas, meta, crm]
type: defeito
status: evergreen
custou: baixo
codigo:
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/page.tsx
created: 2026-10-02
updated: 2026-10-02
summary: A campanha "Dom" (Instagram, R$ 200, Dom Parque) contava zero clientes com 7 leads do anúncio na carteira. O anúncio aponta para /wa/<imóvel>, e o lead chega com origem meta/ctwa e o NOME do imóvel em anuncio_origem, sem id da Meta e sem impulsionamento_id. A tela só ligava lead a campanha cadastrada pelo corretor quando ele ligava à mão. Agora o lead do link cai na campanha do mesmo corretor, do imóvel cujo nome ou apelido o link levou, que estava no ar no dia (fuso de São Paulo).
---

# Lead do link do anúncio cai na campanha do imóvel

Relato de 02/10/2026: "o contador dos leads que vêm pelo anúncio da Meta
não está funcionando".

## O que estava acontecendo

- O anúncio funcionava: 692 cliques em `/wa/lancamento-ao-lado-do-parque-ne51970`
  desde 29/09 e 7 leads com `origem = meta/ctwa`, `anuncio_origem = "dom parque"`.
- Um lead entra numa linha da tela por quatro caminhos. Os três antigos
  eram: id da Meta, anúncio sem etiqueta, ou `impulsionamento_id` posto à
  mão. O lead do link não tem nenhum dos três, e a campanha cadastrada
  pelo corretor (`criadaPeloCorretor`) só aceitava o terceiro.

## A regra (caminho 4, `campanhaDoLinkDoAnuncio`)

- mesmo corretor; campanha com imóvel; o nome do link (normalizado como no
  porteiro) é o nome ou um apelido do imóvel;
- o dia do lead em São Paulo fica entre `inicio` e `fim` da campanha;
- duas no ar: vence a que começou por último;
- lead ligado à mão ou com id da Meta não passa por aqui (não conta duas vezes).

É calculado na leitura, sem gravar nada: renomear o imóvel ou mudar o
período da campanha reclassifica sozinho.

## Observação

7 leads em 692 cliques (~1%). Os registros `[porteiro] número sem lead com
contextInfo` do período não trazem `externalAdReply`; são conversas
pessoais, não leads do anúncio barrados. Os cliques incluem repetição e
robôs que abrem links; a conversão real só se mede pelos leads.

Ver [[campanha-cadastrada-pelo-corretor]] e [[impulsionamento-do-corretor-pela-etiqueta-da-meta]].
