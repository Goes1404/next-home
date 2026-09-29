---
title: Migration aplicada de uma branch paralela foi apagada pela outra como "fora de migration"
aliases: [colisão da 0113, sorteio preferido, 0129]
tags: [banco, licao]
type: nota
status: evergreen
custou: medio
codigo: [supabase/migrations/0129_sorteio_rodizio_e_preferido.sql, src/lib/whatsapp/sorteioPreferido.test.ts]
created: 2026-09-28
updated: 2026-09-28
fonte: merge de 28/09/2026, ingestao-de-midia × branch de produção
summary: A 0113 do sorteio com corretor preferido foi aplicada em produção a partir de ingestao-de-midia. A branch de produção, sem esse código, achou a função no banco, tratou-a como resíduo e a apagou na 0117. No merge as duas colidiram no número E na assinatura; renumerar não bastava. A junção é a 0129, com os dois parâmetros.
---
# Migration aplicada fora da branch e apagada pela outra

## O que aconteceu

`ingestao-de-midia` criou `0113_sorteio_com_corretor_preferido` e aplicou no
banco: `sortear_corretor_whatsapp(preferido uuid)`. A branch de produção
nunca recebeu o arquivo. Ela usou a própria `0113` para outra coisa (site da
construtora) e, na `0117`, achou a variante `preferido` no banco com a nota
"aplicada direto, fora de qualquer migration". Apagou a variante e pôs
`(p_empreendimento uuid)` com rodízio por imóvel.

No merge de 28/09 o git acusou só dois arquivos de código. O conflito de
verdade apareceu em dois pontos: a guarda de prefixo duplicado e
`sorteioPreferido.test.ts`, que lê a ÚLTIMA definição da função e já não
achava `preferido` nela.

## Por que renumerar não bastava

Com o nome `0129`, a `0113` rodaria depois da `0117` e faria
`create or replace ... (preferido uuid)` sobre uma função `(uuid)` que já
existe com outro nome de parâmetro. O Postgres recusa essa troca. Sem erro, o
efeito seria pior ainda: o rodízio da 0117 sumiria.

## A junção

`0129_sorteio_rodizio_e_preferido` tem uma função só,
`(p_empreendimento uuid default null, preferido uuid default null)`. A ordem
é: preferido, depois o rodízio, depois o sorteio. A ACL da 0052 vem repetida
na assinatura `(uuid, uuid)`. Até esta nota ser escrita, a 0129 **não estava
aplicada** no banco.

## Régua

- Migration aplicada em produção a partir de uma branch que não é a de
  produção vira, para as outras sessões, um "objeto sem origem" — e objeto
  sem origem é removido. Aplicar migration no banco implica levar o arquivo
  para a branch de produção junto.
- Depois de um merge, rodar as guardas que leem migrations. São elas que
  acusam o conflito semântico que o git não vê.

Ver [[producao-pode-servir-commit-de-outra-branch]].
