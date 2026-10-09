---
title: MOC — Ingestão de Mídia
tags: [moc, midia]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-10-09
summary: Upload, PDF de construtora, Google Drive, storage, sharp.
---
# Ingestão de Mídia — Map of Content

Três origens (upload, PDF, Drive), um caminho único de gravação.

- [[upload-de-foto-nunca-funcionou]] ⚠️ registrarMidia é o caminho único
- [[pdf-extrai-imagens-embutidas]]
- [[drive-supports-all-drives]]
- [[sharp-na-vercel-o-binario-nao-chega]]
- [[constante-compartilhada-mora-em-modulo-sem-nativo]]
- [[bucket-nao-se-apaga-por-sql]]
- [[artes-de-ia-expiram-em-48-horas]] ⚠️ arte gerada não é acervo: 48h no banco, 48–72h no Storage
- [[storage-da-arte-de-ia-tem-teto]]
- [[o-teto-do-pdf-e-o-plano-do-supabase]] ⚠️ 50 MB é a parede do plano FREE, não escolha nossa
- [[pdf-lido-como-texto-no-navegador-e-binario]]

- [[o-worker-de-video-roda-sem-segredo]] — 134 execuções vermelhas: secrets do GitHub vazios

- [[planta-que-chega-como-foto]] — botão "É planta" na galeria; e a capa que nunca era gravada
- [[importar-do-site-da-construtora]] — plano: colar o link do site e trazer dados, fotos, vídeos e tours
- [[fila-de-cadastro-pelo-site-da-construtora]] — os 14 candidatos viraram rascunhos lidos do site da construtora (0128)
- [[nomes-que-o-cliente-acerta]] — nenhum site de construtora publica preço; o checklist só cobra apelido de nome de anúncio (02/10)
- [[catalogo-conferido-imagem-por-imagem]] — 44 plantas sem metragem, dormitórios chutados, fotos de outros prédios no APV e no Copa 18; conferido imagem por imagem (0137/0138, 02/10)
- [[videos-e-tours-so-do-canal-da-construtora]] — 18 imóveis sem vídeo nem tour caíram para 4; só canal oficial, conferido pelo oEmbed (0141, 02/10)
- [[banheiros-e-vagas-pelo-apto-vc]] — 55 plantas sem banheiro e 40 sem vaga caíram para 12 e 8; só número que não contradiz as suítes (0142, 02/10)
- [[otimizador-de-imagens-tem-cota-no-hobby]] — fotos quebradas por 402 do otimizador da Vercel; 79 de 1.076 publicadas passam de 500 KB (09/10)

## Relacionados
- [[MOC — Front Público]] · [[MOC — Banco de Dados]] · [[Home]]
