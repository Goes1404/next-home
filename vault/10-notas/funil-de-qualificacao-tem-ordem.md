---
title: O funil de qualificação tem ordem, e ela é a da corretora real
aliases: [renda antes de indicar, funilQualificacao]
tags: [prompt, crm, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/funilQualificacao.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA (agosto/2026)
summary: região → pronto/planta → tipologia → RENDA MENSAL → indicação → visita. A renda vem ANTES de indicar imóvel. E o CONVITE vem cedo; o HORÁRIO só depois do funil.
---
# O funil de qualificação tem ordem

A ordem é a da corretora real (agosto/2026):

**região → pronto ou na planta → tipologia → RENDA MENSAL → indicação →
visita.**

A renda vem **antes** de indicar imóvel e antes de propor horário: é ela que
define o que o banco financia, e sem ela a visita pode ser marcada para quem
não tem perfil. Na conversa da Priscila, a Bruna faz exatamente isso — região
na 4ª mensagem, tipologia na 5ª, convite na 6ª.

## A contradição que eu mesmo criei (v8)

A regra 12 dizia "primeiro entenda, depois convide" e a seção de agendamento
dizia "ofereça CEDO". Resolvida separando: o **CONVITE** ("quer conhecer o
decorado?") vem cedo; o **HORÁRIO** concreto só depois do funil.

## Renda ≠ orçamento

`renda_mensal` ≠ `orcamento_min/max`. Orçamento é quanto quer gastar no
imóvel; renda é quanto entra por mês. Perguntas diferentes, as duas importam. A
renda mora em `leads` (é lá que a ficha do CRM lê) e só é escrita quando a
extração acha valor — dossiê reextraído sem a renda na conversa **não pode
apagar** o que o cliente já disse.

## Relacionadas
- [[estilo-da-casa-foi-medido]]
- [[regras-de-conversa-da-sofia]]
