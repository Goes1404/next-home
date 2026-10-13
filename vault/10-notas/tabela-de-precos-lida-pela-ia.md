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
  - src/app/corretor/(painel)/admin/precos/page.tsx
summary: PDF e prints (13/10). A tabela da construtora tem o empreendimento no cabeçalho e as unidades embaixo; o leitor por linha não achava nada. A IA casa com o catálogo e aponta o menor valor de unidade, que só entra se estiver escrito no arquivo.
updated: 2026-10-13
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

## Prints e o guia de 53 páginas (13/10/2026)

Pedido: ler o "tabelão" da RSF tanto do PDF (guia de parceria, 53 páginas)
quanto dos prints da tela do celular.

- **PDF e prints sobem DIRETO para o Storage** (`corretores/<id>/tabelas/`,
  pasta pessoal da 0015) e só o caminho vai à action
  (`lerArquivosDaTabela`), que apaga os arquivos depois de ler. Antes o PDF
  cruzava a action, com teto de 8 MB; agora o teto é 40 MB.
- **Print: dois passos.** A IA transcreve cada imagem em detalhe alto, uma
  linha por unidade com o nome do empreendimento repetido
  (`transcreverPrintDaTabela`); a transcrição passa pela mesma leitura do
  PDF, com a trava "o valor está escrito" valendo contra a transcrição. O
  texto fica na caixa para o gestor conferir com o print.
- **"Unidades de referência, não o mínimo da tabela"**: o rodapé do tabelão
  diz isso. Quando o arquivo avisa (`avisaValoresDeReferencia`), item que
  SUBIRIA o "a partir de" entra desmarcado: o Breeze tem unidade de
  R$ 349.900 e a de referência é de R$ 381.405.
- **Apelidos do cadastro entram no catálogo da IA e na conferência de
  nome**: a tabela escreve "Viva RSF Jaguaribe" para o "Viva Jaguaribe".
- **Pedaço sem valor de imóvel não vai à IA**, seis pedaços por vez e prazo
  total de 50 s: o guia inteiro estourava os 60 s da página com três por
  vez. O que sobrar sem ler é dito na tela.
- **Não provado com a IA de verdade**: não há chave da OpenAI nesta máquina.
  A prova é subir os prints do tabelão em produção.

Do tabelão de out/2026, sem cadastro no catálogo: Bless Shopping Barueri,
Reserva Urano Ecopark, Viva RSF Carapicuíba, Bless Praça da Árvore, Bless
Ipiranga e Murat 208. Esses vêm como "não encontrado".

## PDF que desenha letra por letra (13/10/2026)

Relatado logo depois: "A IA achou valores, mas nenhum estava escrito no
arquivo", com o texto da caixa saindo `T / E / S / T / E`, uma letra por
linha. O defeito era do extrator (`pdfTexto.ts`), não da IA.

- **Todo `Td`/`Tm` virava quebra de linha.** Chrome, Canva e ferramentas de
  design posicionam cada letra (ou cada trecho com espaçamento entre letras)
  com um operador próprio, e o preço "381.405,62" saía em dez linhas. A IA lia
  o número pela forma, mas a trava "o valor está escrito" procurava o número
  inteiro no texto e não achava.
- **Hoje o fluxo é interpretado pela posição**: matriz de texto, `cm`/`q`/`Q`,
  e a largura de cada glifo (`/Widths` ou `/W` da fonte; estimada quando o
  arquivo não diz). Mesma linha de base = mesma linha de texto; salto para a
  frente = espaço. Bônus: as células de uma linha da tabela saem juntas, o que
  é exatamente a "unidade por linha" que a leitura espera.
- **Fonte dentro de `/ObjStm`** (PDF 1.5+, comum em exportação de design) agora
  é lida: antes o dicionário comprimido não era achado, e sem `/ToUnicode` o
  texto saía em códigos de glifo.
- **Reproduzido sem o arquivo do usuário**: um PDF impresso pelo Chromium do
  Playwright com `letter-spacing` dá o mesmo `T / E / S / T / E` no extrator
  antigo. É o jeito barato de testar PDF real neste ambiente.
- Texto com espaçamento grande entre letras sai como "T E S T E" (é como está
  desenhado); números e nomes de imóvel saem inteiros.
