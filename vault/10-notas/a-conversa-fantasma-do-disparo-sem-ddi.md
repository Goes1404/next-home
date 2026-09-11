---
title: A conversa fantasma que o disparo criava sem DDI
aliases: [conversa duplicada de campanha, telefone_cliente sem 55]
tags: [campanhas, whatsapp, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/campaignDispatcher.ts, src/lib/whatsapp/repositorio.ts, supabase/migrations/0111_conversa_so_existe_para_lead.sql]
created: 2026-09-11
updated: 2026-09-11
fonte: medição em produção ao aplicar a 0111 (11/09/2026)
summary: O disparador abria a conversa com `item.telefone` cru; sem DDI ela não casava com o lead e nascia em paralelo à orgânica — 24 conversas fantasma com 34 mensagens de campanha, que a 0111 quase apagou como "sem lead".
---
# A conversa fantasma do disparo

O envio já normalizava o telefone desde 27/08 (`normalizarTelefoneBr` no
`provider.ts`, ver [[telefone-sem-ddi-acusava-o-lead]]). A **conversa**, não:
`campaignDispatcher` passava `item.telefone` como está no cadastro.

Consequência em cadeia, medida em produção em 11/09/2026:

1. `11981480402` (sem DDI) não casa com o lead, cujo `telefone_e164` é
   `5511981480402` — `candidatosTelefone` só conhece a variante do nono
   dígito, não inventa DDI.
2. Sem lead, a conversa nasce com `lead_id` nulo.
3. Como a busca era por igualdade exata, ela nasce **ao lado** da conversa
   orgânica do mesmo cliente, não no lugar dela.

Resultado: **24 conversas fantasma** com **34 mensagens de campanha** que o
Live Chat nunca mostrou junto do atendimento. Das 37 conversas sem lead do
banco, **30 tinham lead do mesmo corretor** — faltava só o vínculo.

## Por que isso quase virou perda de dado

A 0111 ([[conversa-casa-com-lead-por-telefone]]) começava apagando toda
conversa com `lead_id is null`. Aplicada como estava, teria destruído o
histórico de 30 clientes cadastrados e 68 mensagens em nome de uma regra
que existe para **não guardar conversa de desconhecido**.

A ordem correta, e que a migration passou a ter: fundir a fantasma na
canônica (reapontando mensagens, follow-ups e telemetria **antes** do
delete, senão o cascade os leva junto), religar o que casa, normalizar o
telefone, e só então apagar o que sobrou — 7 conversas, 21 mensagens.

## A régua

**Medir antes de aplicar migration destrutiva.** `count(*)` do que morreria,
e depois a pergunta que muda tudo: *desses, quantos são o alvo de verdade?*
Aqui 30 de 37 não eram.

**Erro assimétrico do casamento por telefone.** Não casar custa um vínculo;
casar errado manda a conversa de um cliente para a ficha de outro. Por isso
`candidatosTelefone` continua sem palpite de DDI — `14155552671` é um número
dos EUA e virar `5514155552671` inventaria pessoa. Quem normaliza é o
chamador que tem telefone de **cadastro**, não o que recebe o JID.

Ver também: [[privacidade-apaga-o-que-a-ia-depois-precisa]].
