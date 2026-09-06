---
title: Visita — proposta, confirmação e gravação
tags: [ia, crm, arquitetura]
type: nota
status: evergreen
custou: baixo
codigo: [src/lib/whatsapp/coerenciaVisita.ts, src/lib/whatsapp/dossierExtractor.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: visitaProposta.confirmadaPeloCliente + validarDataVisita → leads.visita_agendada_em + etapa. Data inválida degrada para alerta comum.
---
# Visita: proposta, confirmação, gravação

`visitaProposta.confirmadaPeloCliente` + `validarDataVisita` → grava
`leads.visita_agendada_em` + etapa. Data inválida degrada para alerta comum.

A data proposta pela IA passa por [[calendario-misturava-dois-fusos|correções
de fuso e de passado]] antes de valer.

## Relacionadas
- [[aviso-por-evolucao-nao-por-mensagem]]
