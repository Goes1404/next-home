---
title: Uma piscada do banco derrubava a home
tags: [arquitetura, defeito, medicao, guarda]
type: nota
status: estavel
custou: 1 sessao
codigo: src/lib/supabase/retentativa.ts, src/lib/queries.ts
summary: Gateway Timeout de segundos no Supabase virava 500 na home e no sitemap. A saída é repetir, não degradar — degradar faria a home anunciar "0 imóveis".
updated: 2026-09-10
---

# Uma piscada do banco derrubava a home

## Como apareceu

Num smoke de rotina depois de um deploy, `/` e `/sitemap.xml` voltaram **500**
enquanto todas as outras rotas respondiam 200. O log de runtime da Vercel:

| quando (UTC) | rota | erro |
|---|---|---|
| 18:00:09 | `/` | `Falha ao listar corretores: Gateway Timeout` |
| 18:00:19 | `/api/webhooks/whatsapp` | `Falha ao gravar mensagem: Gateway Timeout` |
| 18:00:22 | `/sitemap.xml` | `Falha ao listar slugs: Gateway Timeout` |

Nas rodadas seguintes, 3/3 em 200. **A falha era INTERMITENTE** — no mesmo
minuto em que `/` deu 500, `/regioes/alphaville` deu 200.

## Repetir, e NÃO degradar

Degradar para lista vazia parece mais gentil e aqui seria **pior**:

1. A home tem uma faixa de prova com os números REAIS do catálogo. Com lista
   vazia ela anunciaria **"0 imóveis no catálogo"** na primeira dobra — uma
   afirmação falsa sobre o negócio. Página de erro é ruim; página que mente é
   pior.
2. O `sitemap.xml` encolheria de ~39 URLs para meia dúzia, e o Google
   **acredita** num sitemap que encolheu: trata o que sumiu como removido. Um
   500 no sitemap, ao contrário, faz o robô voltar depois.

Erro que se conserta sozinho em segundos não merece decisão de produto —
merece uma segunda tentativa.

## O que NUNCA é repetido

Erro de CONSULTA: coluna inexistente, permissão negada, ambiguidade de
relacionamento (o `PGRST201` que já derrubou o site inteiro nesta base). Todos
vêm com `code` do PostgREST e não melhoram na segunda vez — repetir só dobra a
espera do visitante antes do mesmo erro. Falha **sem** `code` (gateway, rede,
socket) é a que ganha nova chance.

## Detalhes que custaram tempo

- **A fábrica, não a consulta pronta.** O construtor do `postgrest-js` é um
  thenable de **uso único**: aguardá-lo de novo devolve o resultado já
  resolvido, sem tocar na rede. Se o parâmetro fosse a consulta pronta, a
  retentativa repetiria o mesmo erro de graça e **pareceria funcionar**.
- **O genérico é a RESPOSTA inteira, não o `data`.** O Supabase tipa o retorno
  como união discriminada, e é ela que faz `if (error) throw` estreitar `data`
  para não-nulo depois. Reconstruir como `{ data: T; error: E | null }` achata
  a união — dois erros de compilação apareceram exatamente assim.
- **Teto de tempo, não só de tentativas.** Se a falha é TIMEOUT, cada tentativa
  custa o timeout inteiro; três empilhadas estouram o limite da função e trocam
  um 500 rápido por um 504 lento — pior para o visitante e para o robô.
- **A personalização fica de fora.** `buscarDestaquesCorretorAtivo` já degrada
  sozinha (nem lê o `error`). Uma piscada ali custa a ORDEM preferida do
  corretor, não a página; fazer o visitante esperar por um enfeite é trocar um
  custo invisível por um visível.

## A guarda

`retentativaNaHome.test.ts` **reproduz o incidente**: finge o `Gateway Timeout`
na primeira chamada e afirma que `getCorretores` ainda devolve a equipe.
Provocada tirando a retentativa, ela falha com a mensagem literal que a
produção mostrou — `Falha ao listar corretores: Gateway Timeout`.

Relacionadas: [[o-tradutor-de-prompt-de-imagem]]
