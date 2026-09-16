---
title: O teto do PDF é o plano do Supabase, não uma escolha nossa
aliases: [limite de 50 MB do storage, 402 do storage]
tags: [supabase, midia, medicao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/imoveis/limitesPdf.ts, src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemPdf.tsx]
created: 2026-09-13
updated: 2026-09-13
fonte: Management API do Supabase, medida em 13/09/2026
summary: O book de 182 MB não cabe porque o plano do projeto é o FREE, e nele o upload por arquivo para em 50 MB. Pedir mais devolve HTTP 402. Subir o teto da tela sozinho só troca a recusa nossa por uma do Storage.
---
# O teto do PDF é o plano do Supabase

Relatado como *"precisamos aumentar o limite de megabytes para comportarmos
os books completos"* — um book de construtora com **182 MB** contra um teto
de 25 MB na tela.

## O que foi medido

A pergunta parecia ser "qual número trocar no código". Não era. A parede é
externa, e a Management API responde em duas consultas:

```bash
curl -H "Authorization: Bearer $SUPABASE_PAT" \
  "https://api.supabase.com/v1/projects/<ref>/config/storage"
# {"fileSizeLimit":52428800, ...}   ← 50 MB, limite GLOBAL do projeto

curl -H "Authorization: Bearer $SUPABASE_PAT" \
  "https://api.supabase.com/v1/organizations/<slug>"
# {"plan":"free", ...}
```

E a tentativa de elevar o limite diz a verdade inteira:

```bash
curl -X PATCH -d '{"fileSizeLimit":209715200}' .../config/storage
# HTTP 402
# {"message":"File size limit more than 52,428,800 bytes.
#   Please upgrade the project to a paid plan to unlock higher file size limits."}
```

**Plano `free` = 50 MB por arquivo, e ponto.** O bucket `empreendimentos` já
estava exatamente nesse teto (ver [[storage-da-arte-de-ia-tem-teto]]);
quem segurava em 25 MB era só a nossa tela.

## Por que subir o número da tela não basta

O teto do cliente existe para recusar **antes** do upload começar. Se ele
subir acima do que o Storage aceita, o corretor passa a esperar o envio de um
arquivo que vai ser recusado no fim — a recusa nossa, rápida e explicada,
vira uma recusa do provedor, lenta e genérica. Por isso
`TETO_PDF_BYTES = 50 MB` é o número **máximo honesto** hoje, e o comentário do
arquivo guarda o porquê.

De quebra, a mensagem da tela cravava `"o limite é 25 MB"` em texto: ela
continuaria dizendo 25 depois de o teto virar 50. Agora sai de `TETO_PDF_MB`,
derivado da constante — é a mesma classe do
[[texto-desatualizado-aponta-o-diagnostico-para-o-lugar-errado]].

## Os dois caminhos para passar de 50 MB

Nenhum dos dois é "trocar um número", e os dois são decisão de fora do código:

1. **Plano Pro do Supabase** (~US$ 25/mês): o teto por arquivo sobe para
   50 GB. Só que o pipeline não acompanha de graça — `analisarPdf` baixa o
   arquivo inteiro para um `Buffer` e ainda o converte para string `latin1`,
   ou seja, guarda ~2x o tamanho do PDF na memória da função, e depois roda
   `sharp` em até 60 imagens dentro do orçamento de tempo da rota. Um book de
   182 MB por esse caminho é ~370 MB de RAM antes da primeira prévia. Não
   está medido, e enquanto não estiver é hipótese.
2. **Extrair as imagens no NAVEGADOR**, sem nunca mandar o PDF para lugar
   nenhum. Aí o limite do Storage deixa de existir para o arquivo (só as
   imagens escolhidas sobem, poucos MB cada), a memória e o tempo passam a
   ser da máquina do corretor, e o custo some. É a resposta certa a médio
   prazo e é uma obra de verdade: `pdfImagens.ts` (307 linhas) e
   `pdfTexto.ts` (242) usam `node:zlib` síncrono, que no navegador vira
   `DecompressionStream` assíncrono, e as prévias saem de `sharp`, que
   viraria `canvas`.

## A régua que fica

**Antes de mexer no número, descobrir de quem é a parede.** Um teto de
aplicação e um teto de plataforma se parecem na tela e pedem consertos
opostos: um é uma linha de código, o outro é dinheiro ou arquitetura.

Ver também: [[storage-da-arte-de-ia-tem-teto]] ·
[[constante-compartilhada-mora-em-modulo-sem-nativo]]
