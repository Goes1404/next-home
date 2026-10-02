---
title: Tabela de preços da construtora lida pela IA
aliases: [reajuste em massa com IA, upload da tabela de preços, menor valor de unidade]
tags: [ia, catalogo, painel]
type: nota
status: stable
custou: medio
codigo:
  - src/lib/precos/leituraPorIa.ts
  - src/app/corretor/(painel)/admin/precos/actions.ts
  - src/app/corretor/(painel)/admin/precos/PrecosManager.tsx
summary: A tabela da construtora tem o empreendimento no cabeçalho e as unidades embaixo; o leitor por linha não achava nada. A IA casa com o catálogo e aponta o menor valor de unidade, que só entra se estiver escrito no arquivo.
updated: 2026-10-02
---

# Tabela de preços lida pela IA

Relatado em 02/10/2026: "o upload das tabelas de preços não está
funcionando de forma certa".

## Por que o leitor antigo errava

`spreadsheetParser` espera uma linha por imóvel ("Nome do imóvel  Preço").
A tabela que a construtora manda tem **o empreendimento no cabeçalho e uma
linha por unidade** (torre, final, área, valor, sinal, mensais). O nome não
está em nenhuma linha de preço, e o "a partir de" é o MENOR valor de
unidade, que não está escrito como tal em lugar nenhum.

## Como funciona agora

- PDF: texto extraído no servidor (`extrairTextoDePdf`) → IA
  (`lerTabelaDePrecosComIa`). Texto colado: botão "Ler com IA".
- A IA recebe a lista do catálogo (slug, nome, bairro, cidade) e devolve,
  por empreendimento, o slug e o menor valor total de unidade.
- Tabela longa vai em pedaços de 12 mil caracteres, e cada pedaço leva o
  começo do arquivo, onde o nome costuma estar. Entre pedaços fica o menor
  valor.
- **Travas:** o slug tem de existir no catálogo (senão "não encontrado",
  desmarcado); o valor tem de estar escrito no arquivo (`valoresEscritos`);
  o valor tem de estar entre R$ 50 mil e R$ 50 milhões, para parcela, sinal
  ou valor do m² não virarem preço.
- Itens casados entram marcados. O gestor confere a tela e aplica, e o
  histórico e o Desfazer continuam iguais.

## O que não cobre

PDF escaneado (sem texto): a tela pede para colar os valores. A página da
tabela tem `maxDuration = 60`.

Ver [[a-renda-da-ficha-nao-chegava-ao-atendimento]], que depende do
"a partir de" preenchido.
