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

