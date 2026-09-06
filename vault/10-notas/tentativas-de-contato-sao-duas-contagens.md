---
title: Tentativas de contato são DUAS contagens, e a resposta da IA não conta
aliases: [tentativas_sem_resposta, registrar_tentativa_contato]
tags: [crm, banco, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [supabase/migrations/0060_tentativas_de_contato.sql, src/lib/whatsapp/tentativasContato.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — 0060
summary: Total na vida nunca diminui; sem_resposta zera quando o cliente fala. O mesmo número significaria coisas opostas. Só conta o que NÓS iniciamos. Incremento mora no banco.
---
# Tentativas de contato: duas contagens

- `tentativas_contato`: total na vida, nunca diminui.
- `tentativas_sem_resposta`: zera quando o cliente fala.

Guardar só o total não resolve nada: um lead com 6 tentativas que respondeu
todas é o melhor da carteira; um com 3 sem resposta é o que precisa sair da
fila — **o mesmo número significaria coisas opostas**. A ficha destaca o SEM
RESPOSTA.

## A resposta da IA NÃO é tentativa

Só conta o que **nós** iniciamos: campanha, follow-up e mensagem do corretor
pelo Live Chat. Contar a resposta faria a conversa mais engajada parecer a mais
insistente — o contrário do que o número serve para decidir.

## Onde mora

- Incremento no banco (`registrar_tentativa_contato`, `security definer`) —
  mesmo motivo das funções de cota: concorrência entre cron, corrente e botão.
- **Aqui a regra da casa se inverte de propósito**: contador em coluna, não
  conta na leitura — contar por lead a cada render seria uma consulta por
  linha na lista (30) e no quadro (300). Contador é barato de ler, e guarda
  FATO, não julgamento.

## Relacionadas
- [[dado-gravado-e-nao-exibido-e-dado-perdido]]
- [[campanha-tambem-mexe-no-funil]]
