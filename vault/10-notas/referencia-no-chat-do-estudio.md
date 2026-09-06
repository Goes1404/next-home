---
title: Foto de referência no chat do Estúdio — o motor já sabia, faltava o clipe
aliases: [anexar referência, clipe do chat, referenciaPath]
tags: [ia, midia, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/estudio/contrato.ts, src/lib/estudio/turno.ts, src/app/corretor/(painel)/estudio/uploadReferencia.ts, src/app/corretor/(painel)/_componentes/ChatBase.tsx, src/app/api/imagens/gerar/route.ts]
created: 2026-09-06
updated: 2026-09-06
fonte: pedido do usuário, 06/09/2026
summary: gerarImagem (images/edits), receitas precisaFoto, temReferencia do engenheiro e referenciaPath da rota já existiam SEM nenhum caminho de UI — as receitas de foto eram inalcançáveis pelo chat.
---
# Foto de referência no chat do Estúdio

Pedido: "enviar referências no chat, como no ChatGPT". A investigação mostrou
que **o motor inteiro já existia sem UI**: `gerarImagem` chama
`/v1/images/edits` quando há `referencia`; a rota `/api/imagens/gerar` aceita
`referenciaPath` confinado a `corretores/<id>/`; o engenheiro de prompt
recebe `temReferencia`; e as receitas `ambientar_decorado` e `melhorar_foto`
(`precisaFoto: true`) estavam **inalcançáveis** — o turno hardcodeava
`temReferencia: false` e pulava toda receita que exige foto.

Lição irmã do `engenheiroDePrompt` ("existia pronto e desligado"): **antes de
construir, procurar o que o motor já sabe fazer sem ninguém chamar.**

## Como ficou

- **Upload direto do navegador** para `corretores/<id>/referencias/<hash>`
  (`uploadReferencia.ts`) — Server Action tem teto de corpo (lição do PDF);
  nome por hash torna idempotente (esquema do `registrarMidia`).
- **Contrato**: mensagem `{tipo:"referencia", path, url}`;
  `PropostaDeArte.referenciaPath` e `PropostaDeVideo.fotosExtras` — a
  proposta CARREGA a foto, então o vínculo sobrevive a mensagens novas.
- **Arte**: `referenciaAtiva` = a ÚLTIMA anexada (uma por vez — o endpoint de
  edição aceita uma; "qual das cinco?" é ambiguidade sem pergunta boa).
- **Vídeo**: `referenciasDaConversa` (dedup por path) entram como
  `fotosExtras` do pedido de catálogo — classificadas por visão como as de
  "minhas" e somadas à galeria; a régua do roteiro continua decidindo.
- **Guardas** (estudio.test.ts lê o código): action valida prefixo da pasta
  do corretor; "Gerar assim" manda o path da PROPOSTA; fotos extras do vídeo
  saem da proposta GRAVADA, nunca do POST da tela.

## As perguntas já existiam

O outro pedido ("a aplicação deve perguntar quando necessário") já era o
comportamento do Estúdio — uma pergunta por turno, com chips, parando no
"ok". A referência agora alimenta essas perguntas (`temReferencia` muda o que
o engenheiro pergunta).

## Relacionadas
- [[midia-por-slug-nunca-por-url]] — mesma família de confinamento
- [[upload-de-foto-nunca-funcionou]] — a policy 0015 que cobre a pasta
- [[MOC — IA e Atendimento]]
