---
title: Medir produção, não confiar em "parece que está funcionando"
tags: [licao]
type: nota
status: evergreen
custou: alto
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — regra da casa
summary: Tipos, testes, build e "a mensagem chegou" podem estar todos verdes com o sistema quebrado. Só consulta no banco / medição no navegador / erro do runtime revelam.
---
# Medir produção

Os quatro sinais que o projeto costuma checar — tipos passam, testes passam,
build passa, "a mensagem chegou no WhatsApp" — **podem estar todos verdes com o
sistema quebrado**:

- [[gravar-mensagem-antes-do-vinculo]] — só consulta no banco revelava
- [[sharp-na-vercel-o-binario-nao-chega]] — só `get_runtime_errors`
- a capa do hero parada — só medindo o `transform` no navegador
- [[upload-de-foto-nunca-funcionou]] — 286 mídias "saudáveis", zero de upload:
  **um caminho que ninguém consegue usar não gera dado ruim — gera ausência de
  dado, que é bem mais difícil de notar**
- [[medir-carga-com-rollback]] — o banco tinha 57 leads, volume que não prova
  nada

## Formas de medir usadas aqui

- Consulta direta comparando `enviado_em` com `lag(enviado_em)` (rajada)
- Rota temporária que reporta estado
  ([[erro-que-so-existe-no-runtime-se-investiga-no-runtime]])
- HTML avulso com o CSS compilado para medir layout sem login
  ([[barra-fixa-que-estoura-a-largura]])
- Leads sintéticos com `rollback` ([[medir-carga-com-rollback]])

## Relacionadas
- [[falha-calada-e-a-pior]]
- [[higiene-real-causa-errada]]
