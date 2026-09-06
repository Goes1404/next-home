---
title: A campanha mandava mensagem e NÃO mexia no funil
aliases: [novo → primeiro_contato]
tags: [crm, campanhas, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/campaignDispatcher.ts, supabase/migrations/0059_etapa_de_quem_ja_recebeu_campanha.sql, src/lib/whatsapp/etapaAutomatica.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — 27/08/2026
summary: O avanço novo→primeiro_contato só era chamado pelo webhook. Quem recebia disparo e não respondia ficava em "Novo" para sempre — e o filtro "parados" reoferecia quem acabou de receber campanha.
---
# A campanha também mexe no funil

O avanço `novo → primeiro_contato` só era chamado pelo webhook — ou seja,
quando a IA **respondia** alguém que escreveu. Quem recebia um disparo e não
respondia ficava em "Novo" para sempre, já tendo sido abordado.

Medido: 10 leads com mensagem entregue, nenhum fora de "Novo". O estrago é
duplo e calado: a coluna "Novo" mistura quem nunca foi abordado com quem já
recebeu, e o filtro "parados há 15 dias" **volta a oferecer para a próxima
campanha exatamente quem acabou de receber uma**.

Corrigido no disparador (depois de gravar o envio como bem-sucedido) e no
passado pela 0059.

## A regra

**Ao criar caminho novo que FALA com o cliente, procurar quem mexe no funil.**
`etapaAutomatica.test.ts` lê os três arquivos
([[testes-que-leem-o-codigo]]).

## Relacionadas
- [[tentativas-de-contato-sao-duas-contagens]]
- [[followups-consomem-cota]]
