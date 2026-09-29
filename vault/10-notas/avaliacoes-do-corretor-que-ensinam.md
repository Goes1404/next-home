---
title: Avaliações do corretor que ensinam — motivo do 👎, 👍 como exemplo e relatório semanal
aliases: [motivo da avaliação, respostas aprovadas, relatório das avaliações, 0131]
tags: [ia, crm, decisao]
type: nota
status: growing
custou: medio
codigo:
  - supabase/migrations/0131_motivo_da_avaliacao_da_ia.sql
  - src/lib/whatsapp/motivosDaAvaliacao.ts
  - src/lib/whatsapp/respostasAprovadas.ts
  - src/lib/whatsapp/recuperacao.ts
  - src/lib/whatsapp/aprendizadoContinuo.ts
  - src/lib/whatsapp/relatorioDasAvaliacoes.ts
  - src/lib/crm/enviarRelatorioDasAvaliacoes.ts
  - src/app/corretor/(painel)/conversas/Chat.tsx
  - src/app/corretor/(painel)/conversas/acoes.ts
created: 2026-09-29
updated: 2026-09-29
fonte: pergunta do usuário ("as avaliações dos corretores realmente vão ajudar?") + medição no banco
summary: Em 29/09 havia 13 avaliações na vida inteira e nenhuma parte do sistema as lia. O 👎 ganhou motivo em um toque, o 👍 passou a virar exemplo no prompt, conversa com 👎 saiu do few-shot, e o corretor recebe toda segunda o resumo do que marcou.
---
# Avaliações do corretor que ensinam (0131)

**Medido antes de mexer:** 13 avaliações (7 👎, 6 👍) em mais de 300 respostas
da IA, e só dois lugares liam o campo: a contagem da fila de revisão e o
script manual `exportarGolden`. A IA não aprendia nada com o 👍/👎.

## O que mudou
- **Motivo do 👎 em um toque** (`ia_interacoes.motivo_avaliacao`): não
  respondeu, inventou, robótica, insistente, imóvel errado, outro. As
  categorias são as da análise de 28/09 ([[eval-de-28-09-e-a-v41]]). Os
  botões aparecem logo depois do 👎, antes do "como você responderia?".
- **👍 vira exemplo** (`respostasAprovadas.ts`): a resposta aprovada volta
  ao prompt das conversas seguintes do MESMO corretor, com a fala do cliente
  que ela respondeu, escolhida por assunto. Sem assunto em comum, nenhuma
  entra (diferente da correção, que ensina o jeito e sempre entra).
- **Few-shot respeita a avaliação** (`recuperacao.ts`): conversa com
  resposta 👎 não vira exemplo (o exemplo vai inteiro ao prompt, e a resposta
  ruim iria junto); conversa com 👍 ganha até 75 pontos.
- **Relatório semanal no WhatsApp do corretor**, segunda das 9h ao meio-dia,
  com os 👎 por motivo, um exemplo de cada, as correções da semana e quantas
  respostas ficaram sem avaliação. Mesmo claim do resumo do dia
  (`relatorio_avaliacoes_em`). Não vai por e-mail: o canal foi descartado.
- O "como você responderia?" (0125) já existia e já voltava ao prompt; foi
  mantido como está.

## Segurança
- A policy de UPDATE de `ia_interacoes` liberava a linha inteira do dono e o
  grant era o padrão de tabela: o corretor podia reescrever a telemetria pela
  API. Agora só `avaliacao` e `motivo_avaliacao` (revoke de tabela antes do
  grant por coluna). Conferido nos dois sentidos com sessão fingida dentro de
  `rollback`: motivo grava, `modelo` dá "permission denied".

## Armadilha de passagem
O "por quê?" mostrava "2.345 exemplos": o turno contava o TAMANHO do texto do
few-shot. Hoje conta os blocos (`contarExemplosDoAprendizado`).
