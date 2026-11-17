---
title: Comunicado pelo número central no privado dos corretores
aliases: [comunicado, comunicados, novidades para os corretores, mensagem para a equipe pelo central]
tags: [whatsapp, anti-ban, admin, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - supabase/migrations/0260_comunicados_pelo_central.sql
  - src/lib/central/comunicado.ts
  - src/lib/central/comunicadoRegras.ts
  - src/app/plataforma/comunicados/page.tsx
  - src/app/plataforma/comunicadosAcoes.ts
  - src/app/api/cron/followups/route.ts
created: 2026-11-17
updated: 2026-11-17
fonte: pedido do dono de 17/11 (novidades da Astro no privado dos corretores da Aretz)
summary: /plataforma/comunicados manda uma mensagem com {nome} no privado de cada corretor ativo de UMA imobiliária, pelo número central. A fila anda no tique dos follow-ups (pg_cron, 5 min) — uma por tique, 9h–20h59 seg–sáb, até 10/dia, intervalo mínimo de 4 min, "Oi" variado, pausa após 3 falhas. Vai também para quem nunca falou com o central (decisão do dono), mas só grava no histórico de quem já conversou, para não ligar os avisos automáticos nos demais.
---
# Comunicado pelo número central no privado dos corretores

## O que é
Tela só do administrador da plataforma, `/plataforma/comunicados`:
escolher a imobiliária, ver a lista (ativos, não ocultos, com WhatsApp; a
ordem da lista é a de envio), revisar a mensagem com `{nome}` e confirmar.
A fila (`comunicado_envios`, 0260) nasce com quem a prévia mostrou.

## Por que tão devagar
É tráfego que NÓS puxamos, do central, inclusive para quem nunca falou com
ele — a classe que derruba número (ver [[lista-de-transmissao-pelo-numero-central]]
e a regra `jaConversou` de `src/lib/central/avisos.ts`). Por isso:
- uma mensagem por tique (`/api/cron/followups`, pg_cron a cada 5 min), sem
  agendador novo nem segredo novo no Vault;
- janela `dentroDaJanela` (9h–20h59, sem domingo), teto de 10 por dia somando
  todos os comunicados (`PRIMEIRO_CONTATO_POR_DIA`), 4 min no mínimo entre duas;
- o "Oi" do começo se alterna (Oi, Olá, Oii, Opa) para não sair texto igual;
- 3 falhas seguidas pausam o comunicado; retomar é na tela.

## Armadilha evitada
`registrarAvisoNoHistorico` CRIA a linha de `central_estado` quando não
existe. Chamar para quem nunca falou com o central faria essa pessoa passar
a receber pelo central o resumo das 8h e os outros avisos automáticos
(`canalDoAviso` olha justamente essa linha). O comunicado só grava o
histórico de quem já tem conversa.

## Para entrar no ar
1. Aplicar a 0260 em produção.
2. Publicar o código (o tique só processa depois do deploy).
3. Abrir `/plataforma/comunicados`, escolher a imobiliária, revisar, confirmar.

## Relacionadas
- [[MOC — Campanhas e Anti-ban]]
- [[lista-de-transmissao-pelo-numero-central]]
