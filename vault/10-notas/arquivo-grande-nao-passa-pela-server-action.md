---
title: Arquivo acima de 4,5 MB não passa pela Server Action — sobe direto ao armazenamento
aliases: [envio direto ao armazenamento, upload assinado, 4,5 MB da Vercel, link de documentos]
tags: [infra, midia, crm, armadilha, decisao]
type: armadilha
status: evergreen
custou: medio
codigo: [src/lib/crm/envioAutorizado.ts, src/lib/crm/fotoParaEnvio.ts, src/lib/crm/envioDeDocumento.ts, src/app/(institucional)/documentos/[token]/acoes.ts, src/app/(institucional)/documentos/[token]/EnvioDeDocumentos.tsx, src/app/(institucional)/documentos/[token]/page.tsx, src/app/corretor/(painel)/leads/[id]/documentacaoAcoes.ts, src/lib/crm/linkPublico.ts]
fonte: docs/MEMORIA.md — Link de documentos em dois tempos (16/10/2026)
created: 2026-10-16
updated: 2026-10-16
summary: A Vercel recusa corpo de requisição acima de 4,5 MB (HTTP 413) antes do código rodar, e o `bodySizeLimit: 12mb` do next.config não muda isso. O link de documentos e o anexar da ficha mandavam o arquivo pela Server Action; foto de celular e PDF escaneado falhavam com a tela dizendo "sem conexão". Hoje o servidor autoriza um caminho, o navegador sobe direto ao bucket e o servidor confere o que chegou.
---
# Arquivo grande não passa pela Server Action

**Medido em produção em 16/10/2026:** POST de 5 MB → 413
`FUNCTION_PAYLOAD_TOO_LARGE`; de 3 MB → 400 (chegou ao código). O
`serverActions.bodySizeLimit: "12mb"` do `next.config.ts` só vale até onde a
plataforma deixa chegar. A tela prometia "até 10 MB" e o `catch` dizia "Sem
conexão. Tente de novo." — o cliente tentava de novo um arquivo que nunca ia
passar.

## Como ficou: dois tempos

1. `prepararEnvio` / `prepararAnexo` (Server Action, sem o arquivo): confere
   link ou sessão, item, tamanho e formato informados e o teto; devolve
   `createSignedUploadUrl` de UM caminho (`envioAutorizado.ts`).
2. O navegador sobe direto com `uploadToSignedUrl` e a chave publicável
   (`fotoParaEnvio.ts`, supabase-js por `import()` sob demanda). A
   autorização é a credencial; o bucket segue sem policy para `anon`.
3. `confirmarEnvio` / `confirmarAnexo`: o caminho tem de ser da pasta que
   aquele lead autorizou (`<lead>/envios/` no link, `<lead>/painel/` na
   ficha); tamanho e formato saem do ARMAZENAMENTO (`list` com `metadata`),
   não do navegador; fora da regra o arquivo é apagado; a foto é baixada e
   medida para o alerta de resolução. Confirmar duas vezes devolve ok.

Um link vazado não enche o bucket: além do teto de linhas por link, a pasta
`<lead>/envios` tem teto de arquivos (confirmados ou não).

## Junto

- **Foto reduzida no aparelho**: lado maior 2400 px, JPEG 0,85, orientação
  da câmera aplicada. HEIC vira JPEG quando o navegador abre (Safari), para o
  corretor conseguir ver. Não abre ou não fica menor → vai o original. Medido
  no Chromium: foto de 11,6 MB (acima do limite) → 2,2 MB.
- **Tipo vazio** (HEIC em alguns Android): o formato sai da extensão
  (`formatoDoArquivo`). Sem isso o bucket recebia `application/octet-stream`
  e recusava um arquivo bom.
- **Erro com a causa** (`motivoDaFalhaDeEnvio`): grande demais, formato,
  autorização vencida, sem internet ("nada se perdeu"), armazenamento
  recusou, e aba velha (`ehActionDeOutroBuild`).
- **Link vencido tem página**: `lerLinkVencido` separa o vencido do
  inexistente; o vencido mostra o botão de pedir um link novo ao corretor no
  WhatsApp. Inexistente segue em 404.
- **Dica por item** (`dicaDoDocumento`): toda lista pronta tem dica; item
  inventado pelo corretor fica sem.

## Guarda

`envioDeDocumento.test.ts` lê as duas ações e reprova `instanceof File` ou
`.upload(` nelas. Provocada (md5 conferido): reprova.

## Não provado

Esta sessão não tinha a chave de serviço: o envio assinado não foi
exercitado contra o bucket real. A primeira prova é um envio pelo link em
produção (`lead_documentos` com `caminho like '%/envios/%'`).

Relacionado: [[documentacao-do-lead]], [[otimizador-de-imagens-tem-cota-no-hobby]].
