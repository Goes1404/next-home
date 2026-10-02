---
title: Tabela de preços da construtora lida pela IA
aliases: [reajuste em massa com IA, upload da tabela de preços, menor valor de unidade]
tags: [ia, catalogo, painel]
type: nota
status: stable
custou: medio
codigo:
  - src/lib/precos/leituraPorIa.ts
  - src/lib/leads/pdfTexto.ts
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

## O primeiro PDF real não chegava à IA (02/10/2026)

Tabela de venda do Acqua Park (gerada de HTML pelo Winnovative). O extrator
caseiro devolvia lixo por dois motivos, e sem texto a IA não tem o que ler:

- **Fonte Type0 com `/Identity-H`**: o arquivo grava o número do glifo, não
  a letra ("Todas" saía "7RGDV"). Agora `lerCMap` lê o `/ToUnicode` de cada
  fonte e o texto é decodificado pela fonte em uso (`Tf`).
- **O texto vinha depois de 170 mil bytes de retângulos da grade**, e o
  extrator só procurava `BT` nos primeiros 4 KB. Agora procura no fluxo
  inteiro e tira imagem, fonte e perfil de cor pelo dicionário.

Depois disso o texto sai inteiro: 29 unidades, com a coluna "Total". O menor
total disponível é R$ 608.923,68 (T1-1704). A coluna "Financiamento" tem
números menores (426 mil) e também está escrita no arquivo, então a trava
"o valor existe no texto" não a pega. Quem separa é o prompt, que nomeia as
colunas que não servem e manda ignorar unidade "em negociação". **Não está
provado com a IA de verdade**: não há chave nesta máquina.

O casamento da IA com nome pouco parecido (abaixo de 0,5) vira sugestão
desmarcada. O Acqua Park não está no catálogo, e contra o "Alpha Park View"
o nome dá 0,43.
