---
title: Importar do site da construtora
tags: [midia, decisao, medicao, painel]
type: nota
status: growing
custou: medio
codigo: docs/superpowers/specs/2026-09-25-importar-do-site-da-construtora-design.md
created: 2026-09-25
updated: 2026-09-25
summary: Plano de colar o link do site da construtora e trazer dados, fotos, plantas, vídeos e tours. Vira a terceira origem do importador existente; a medição de 6 construtoras decide o que precisa de navegador.
---

# Importar do site da construtora

Spec: `docs/superpowers/specs/2026-09-25-importar-do-site-da-construtora-design.md`.

- **Terceira origem do importador** (PDF · Drive · Site), não tela nova: o
  rascunho campo a campo, a grade de curadoria, `registrarMidia` e a leitura
  de planta já existem.
- **Medido em 25/09, sem navegador:** Cyrela, EZTEC, Plano&Plano e Even
  entregam texto, imagens e vídeos no HTML (77 a 1.260 URLs de imagem);
  MRV, Vivaz e Tenda montam a página por JavaScript; P4 devolveu 406.
- **Foto de site é grande** (1500 px na Cyrela) contra originais de 320 px de
  vários imóveis do catálogo.
- **Alt e nome do arquivo já dizem planta × foto** ("Planta Tipo 80m²",
  `…_98m2_TIPO_A.jpg`), então dá para pré-marcar sem IA.
- **Buscar URL colada é SSRF**: DNS resolvido e IP privado recusado a cada
  redirecionamento.
- Navegador sem tela (F5) só se a F0, com os links reais das construtoras da
  casa, mostrar que vale.

Ver [[planta-que-chega-como-foto]].

## Construído (25/09)

- **Fotos não estão no `src`.** Cyrela usa `data-src`; EZTEC e Even guardam
  imagem e vídeo dentro de script, com a barra escapada (`https:\/\/`). O
  leitor varre tags, `srcset` (fica a maior), links, `background-image` e o
  HTML cru.
- **A mesma foto em vários endereços**: estilo do Drupal
  (`/files/styles/…/public/x.jpg.webp`), `.webp` e `.png` do mesmo arquivo
  (Plano&Plano), otimizador do Next (`/_next/image?url=`). Tudo vira uma foto,
  na versão original.
- **Pré-marcar sem IA**: tag com alt, planta, ou nome do arquivo que repete as
  DUAS primeiras palavras do endereço. Uma palavra só ("gran") casava com o
  Gran Maia, outro prédio da EZTEC nos "recomendados".
- **`URL` do Node reescreve `[::ffff:127.0.0.1]` em hexadecimal**
  (`::ffff:7f00:1`), e a checagem só conhecia a forma decimal: o loopback
  passava pela trava. O teste de SSRF achou.
- **A P4 abriu** com cabeçalhos de navegador; a 406 era do `User-Agent` curto.
- Duas guardas do leitor não mordiam (a página real traz a foto por mais de
  um caminho); viraram testes de HTML mínimo, e mordem.

## Buscar novidades (F4, 0113)

- O imóvel guarda `site_construtora` e cada foto trazida guarda
  `origem_url`, que é a **chave** da foto (`chaveDaFoto`), não a URL crua:
  na próxima leitura a mesma foto pode vir em outro tamanho ou formato.
- O dedup por sha256 só sabe que a foto já existe DEPOIS de baixar. Com a
  origem guardada, a tela esconde o que já veio sem baixar nada.
- **Coluna nova nunca entra no caminho que não pode cair.** O insert de
  `registrarMidia` e o SELECT do catálogo não citam as colunas da 0113; elas
  são gravadas e lidas por consultas à parte, com o erro virando log. Guarda:
  `lembrarOrigem.test.ts`. É a lição de 07/09 (a 0101 subiu no código e não
  no banco, e três telas caíram) virando desenho.


## RSF e o tour da 3D Explora (25/09)

Medido com `rsf.com.br/carapicuiba/viva-clube-residencial-carapicuiba/`: a
página vem pronta no HTML (texto de ~5 mil caracteres, 49 fotos de 640×960,
plantas reconhecidas) e **não precisa de navegador (F5)**. O que faltava era
o tour: a RSF usa `3dexplora.com.br/seutour.aspx?codigo=…`, e o leitor só
conhecia Matterport e Kuula. Hoje reconhece, recompondo a URL só pelo
`codigo` — a página publica o endereço colado duas vezes no mesmo `src`. O
iframe do YouTube da página vem com `src=""` porque o empreendimento não tem
vídeo: não é conteúdo montado por JS. Antes de pedir F5 para um site,
procurar o que falta no HTML cru: aqui era um domínio de tour desconhecido.

## Tirar imagem da lista, inclusive no meio do envio (25/09)

Relatado: "na hora de inserir as imagens, não tem como tirá-las da lista".
Tocar na foto já alternava, mas nada mostrava que dava — e o envio COPIAVA a
lista no clique, então desmarcar no meio não mudava nada. Hoje a grade
(`GradeCuradoria`, compartilhada com PDF e Drive) tem botão "Tirar da lista" /
"Colocar na lista" e uma marca no canto; no site, o envio lê a lista por ref
na hora em que cada item sai, mostra o estado de cada imagem (fila, enviando,
entrou, falhou) e tem "Parar o envio". O que entrou sai da lista, para
"Trazer os marcados" não repetir. Guarda: `tirarDaFila.test.tsx`.

## O fim da importação ficou explícito (25/09)

Pedido: retorno visual explícito quando a inserção dá certo. O resultado era
uma linha miúda embaixo do botão, fácil de perder depois de um envio de um
minuto. `ResultadoDaImportacao` (compartilhado pelas abas site, PDF e Drive)
é um cartão com a cor do desfecho — tudo entrou (verde), parte ficou de fora
(âmbar), nada novo (neutro) —, que rola para a vista, recebe o foco e tem
"Ver no imóvel". Junto sai o aviso flutuante do painel (`useAvisos`). Só
duplicadas NÃO vira aviso de erro: nada falhou, só não havia o que trazer.
Guarda: `resultadoDaImportacao.test.tsx`.

## Tirar da fila no PDF e no Drive (25/09)

O Drive já enviava foto a foto: bastou conferir a lista por ref na hora em
que cada uma sai, como no site. O PDF não: `gravarEscolhasDoPdf` gravava
TODAS as escolhas numa chamada só, e depois do clique não havia fila para
tirar nada. Hoje a action devolve `porItem` (o desfecho de cada imagem) e a
tela manda em lotes de 4 (`LOTE_PDF`), conferindo a lista antes de cada
lote. Um por vez seria uma releitura do PDF por imagem; tudo de uma vez não
deixa tirar. Com erro no meio, o PDF e a grade ficam, e o que entrou já saiu
da lista — tentar de novo manda só o resto.
