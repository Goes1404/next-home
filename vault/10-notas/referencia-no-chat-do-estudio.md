---
title: Foto de referência no chat do Estúdio — o motor já sabia, faltava o clipe
aliases: [anexar referência, clipe do chat, referenciaPath]
tags: [ia, midia, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/estudio/contrato.ts, src/lib/estudio/turno.ts, src/app/corretor/(painel)/estudio/uploadReferencia.ts, src/app/corretor/(painel)/_componentes/ChatBase.tsx, src/app/api/imagens/gerar/route.ts]
created: 2026-09-06
updated: 2026-09-11
fonte: pedido do usuário, 06/09/2026; correção de defeito, 11/09/2026
summary: O chat envia até quatro fotos de referência; o multipart usa image[] mesmo para uma foto — image singular fazia a referência não chegar ao gpt-image-2.
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
- **Contrato**: mensagem `{tipo:"referencia", path, url, referencias[]}`;
  `PropostaDeArte.referenciaPaths` e `PropostaDeVideo.fotosExtras` — a
  proposta CARREGA a foto, então o vínculo sobrevive a mensagens novas.
- **Arte**: a última mensagem com anexo é a referência ativa; ela pode conter
  até **quatro** fotos, na ordem em que o corretor escolheu.
- **Vídeo**: `referenciasDaConversa` (dedup por path) entram como
  `fotosExtras` do pedido de catálogo — classificadas por visão como as de
  "minhas" e somadas à galeria; a régua do roteiro continua decidindo.
- **Guardas** (estudio.test.ts lê o código): action valida prefixo da pasta
  do corretor; "Gerar assim" manda o path da PROPOSTA; fotos extras do vídeo
  saem da proposta GRAVADA, nunca do POST da tela.

## A referência que subia mas não chegava ao modelo (11/09/2026)

O clipe aceitava apenas um arquivo e o servidor mandava esse arquivo no campo
multipart `image`. O contrato do `gpt-image-2` é **`image[]`**, inclusive na
edição com uma foto. Resultado: a tela podia até gravar a referência no
Storage, mas ela não era uma entrada válida para a geração — falha calada,
porque a arte ainda podia sair criada do zero.

Agora o composer aceita até quatro JPG, PNG ou WebP (8 MB por foto), mostra as
miniaturas removíveis e preserva a seleção na proposta. A rota deduplica e
confina todos os caminhos a `corretores/<id>/`, baixa-os no servidor e
`gerarImagem` faz um `append("image[]", …)` por referência. A primeira URL
continua sendo a referência exibida na galeria, mantendo compatibilidade.

## As perguntas já existiam

O outro pedido ("a aplicação deve perguntar quando necessário") é decidido
pela **LLM**, não por um filtro de palavras local: ela lê o pedido inteiro e
devolve zero a três perguntas contextualizadas, exibidas uma por turno em
chips e parando no "ok". A instrução exige que a pergunta mude materialmente a
peça e proíbe formulário genérico de lente, paleta ou iluminação. Com foto
anexada, a LLM não inventa que a enxerga: pergunta o que preservar, mudar ou
comunicar com ela.

## Relacionadas
- [[midia-por-slug-nunca-por-url]] — mesma família de confinamento
- [[upload-de-foto-nunca-funcionou]] — a policy 0015 que cobre a pasta
- [[MOC — IA e Atendimento]]
