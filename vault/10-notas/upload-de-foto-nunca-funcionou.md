---
title: O upload de foto pelo painel NUNCA funcionou, e o erro culpava a internet
aliases: [três bloqueios empilhados, policy de storage]
tags: [midia, supabase, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [supabase/migrations/0043_storage_midia_empreendimento.sql, src/lib/imoveis/registrarMidia.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Ingestão de material (0042-0043)
summary: Três bloqueios com o mesmo sintoma — policy que não cobria o caminho, prefixo redundante dentro do bucket, e bucket recusando PDF. "Falha ao enviar arquivo. Verifique sua conexão."
---
# O upload de foto nunca funcionou

A única policy de `storage.objects` para `authenticated` cobria
`empreendimentos/corretores/<id>/…` (a pasta pessoal, da 0015). Tanto
`uploadFotoOuPlanta` quanto o envio do book escreviam em
`empreendimentos/<id>/…`, que policy nenhuma cobria — e a mensagem de volta era
**"Falha ao enviar arquivo. Verifique sua conexão"**.

Eram TRÊS bloqueios empilhados com o mesmo sintoma:

1. faltava a policy;
2. o caminho tinha um `empreendimentos/` redundante DENTRO do bucket que já se
   chama assim (a policy confere o primeiro segmento);
3. o bucket recusava `application/pdf`.

**Ao investigar upload que falha, testar a policy com identidade fingida**
([[medir-carga-com-rollback]]).

## Como passou despercebido

`select count(*) from midias` devolve 286 linhas com medida real e blur — o que
parece saúde. Todas vieram de seed e backfill. **Zero de upload.** Um caminho
que ninguém consegue usar não gera dado ruim — gera **ausência de dado**.

## `registrarMidia` é o caminho único

`largura: 1920, altura: 1080` estavam CHUMBADOS no insert e `blur_data_url`
nunca era preenchido — oito componentes da vitrine leem esses campos. Regra:
**nenhum insert em `midias` fora de `registrarMidia`** — com três origens
(upload, PDF, Drive), o insert espalhado repetiria o erro em três lugares.

- `sharp` virou dependência de runtime (derivadas: medida, blur, prévia).
- **A receita do blur — 12px, WebP q45 — não pode mudar**: é a de
  `scripts/gerar-blur.mjs`, que já rodou nas fotos no ar; mudar deixaria foto
  nova com placeholder diferente da antiga.
- Dedup por **sha256 do conteúdo** (`hash_conteudo`), índice único **parcial**
  (as 286 antigas não têm hash). O hash no nome do arquivo torna o upload
  idempotente e a importação retomável.

## Relacionadas
- [[falha-calada-e-a-pior]]
- [[pdf-extrai-imagens-embutidas]]
