---
title: Alerta que está sempre aceso vira paisagem
tags: [painel, crm, licao]
type: nota
status: evergreen
custou: baixo
codigo: [src/lib/crm/interacoes.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — CRM
summary: A classificação atrasada/hoje/futura compara por DIA, não por hora — comparar por hora pintaria a tela de vermelho toda tarde. Mesma lógica do aviso ao corretor e do contador de aba.
---
# Alerta sempre aceso vira paisagem

A classificação atrasada/hoje/futura de tarefas (`situacaoDaTarefa`) compara
por **dia**, não por hora — comparar por hora pintaria a tela de vermelho toda
tarde.

O princípio reaparece em:

- [[aviso-por-evolucao-nao-por-mensagem]] — aviso que chega o tempo todo deixa
  de ser lido;
- contador de aba que só aparece quando > 0
  ([[navegacao-do-painel-tem-regua]]).

## Tarefa sem lembrete é tarefa esquecida

Não há SMTP no projeto — não existe e-mail nem push: **o lembrete é a tela**.
Por isso a mesma tarefa aparece na ficha do lead E na fila do Início.

## Relacionadas
- [[fila-do-inicio-e-uma-fila]]
