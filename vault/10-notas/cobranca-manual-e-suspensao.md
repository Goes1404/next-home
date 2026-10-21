---
title: Cobrança manual e suspensão por atraso
tags: [banco, admin, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0207_cobranca_manual.sql
  - src/lib/planos/cobranca.ts
  - src/lib/planos/cobrancaDoGrupo.ts
  - src/lib/planos/pagamentosDigitados.ts
  - src/lib/whatsapp/quandoAIaResponde.ts
  - src/app/plataforma/cobrancaAcoes.ts
  - src/app/plataforma/grupos/[id]/CobrancaDoGrupo.tsx
  - src/app/corretor/(painel)/_componentes/FaixaCobranca.tsx
summary: A plataforma registra à mão o pagamento da mensalidade; no 5º dia de atraso (ou por suspensão manual) o grupo perde IA, listas, artes e vídeos, e o cliente final nunca vê erro.
updated: 2026-10-21
---

# Cobrança manual e suspensão por atraso

Fase 2C enxuta, escolhida pelo dono em 21/10/2026. Plano:
`docs/superpowers/plans/2026-10-21-fase-2c-cobranca-manual.md`.

- **Ciclo:** vence todo mês no dia do cadastro (`grupos.dia_do_vencimento`,
  1–28; cadastro em 29/30/31 vira 28), sem pro rata. A primeira competência
  é o mês do cadastro e **nasce paga** (gatilho `grupos_primeira_mensalidade`):
  o primeiro vencimento real é o do mês seguinte.
- **Estados** (`situacaoDaCobranca`, módulo puro): `isento` (plano `custo`,
  a Next Home), `em_dia`, `pendente` (do dia do vencimento até o 4º dia),
  `suspenso` (5º dia de atraso em diante, ou `situacao = 'suspenso'`).
- **A suspensão por atraso é DERIVADA na leitura, não gravada.** Sem cron
  novo (o Hobby já tem 4) e sem estado que diverge. `grupos.situacao =
  'suspenso'` é só a suspensão manual, e ela vale até para o plano `custo`.
- **O que para:** IA no WhatsApp (webhook, respostas atrasadas, follow-ups,
  rascunho/abertura pela IA), listas de transmissão (a fila fica intacta e
  volta sozinha), artes e vídeos (recusa antes de qualquer custo, inclusive
  o roteiro, que classifica fotos por visão). **O que continua:** painel,
  login e site público. O cliente final nunca vê erro: a IA fica calada com
  `grupo_suspenso` (sem `voltaEm`) e o corretor atende à mão. Aviso do dia do
  vencimento em diante na `FaixaCobranca` do painel, para todos do grupo.
- **Erro de leitura da cobrança libera a operação** (com log), como a cota da
  IA: falha nossa não pode calar o atendimento de quem pagou.
- **Uma conta só:** o webhook, a varredura, o cabeçalho da conversa e a tela
  da plataforma chamam a mesma `situacaoDaCobranca`/`decidirSeAIaResponde`
  (`grupoSuspenso` vence a cota). Guarda em `quandoAIaResponde.test.ts` lê o
  fonte e confere que cada caminho passa a cobrança.
- **Tabela `pagamentos_do_grupo`:** um pagamento por (grupo, competência);
  sem grant ao anon nem ao authenticated, só a chave de serviço. `mensalidade`
  e `dia_do_vencimento` também ficam fora dos grants de `grupos` (0196).
- **Migração dos grupos que já existiam:** a 0207 marca como pagas (valor 0)
  todas as competências do cadastro até o mês corrente. Sem isso o deploy
  deixaria todo grupo antigo em atraso e suspenso no mesmo dia.
- **Plataforma:** seção "Cobrança" em `/plataforma/grupos/[id]` (registrar e
  remover pagamento, mensalidade, dia, suspender e reativar) e etiqueta na
  lista. Cada ação grava `admin_eventos` (`pagamento_registrado`,
  `pagamento_removido`, `grupo_suspenso`, `grupo_reativado`).
- **Fora do escopo:** cobrança automática, faturas, e-mail de cobrança, troca
  de plano com tela, pro rata.

Ligada a [[cota-de-respostas-da-ia-por-grupo]], [[plataforma-multi-grupo]].
