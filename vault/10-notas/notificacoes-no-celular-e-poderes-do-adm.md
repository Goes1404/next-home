---
title: Notificações novas no celular e poderes do ADM da plataforma
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/notificacoes/lembreteDeVisita.ts
  - src/lib/notificacoes/clienteRespondeu.ts
  - src/lib/notificacoes/leadParado.ts
  - src/lib/notificacoes/senhaVencendo.ts
  - src/app/api/cron/followups/route.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/plataforma/equipeAcoes.ts
  - src/app/plataforma/administradoresAcoes.ts
  - src/app/plataforma/grupos/[id]/SituacaoEPlanoDoGrupo.tsx
  - supabase/migrations/0236_mais_notificacoes_no_celular.sql
  - supabase/migrations/0237_eventos_do_plano_e_dos_administradores.sql
created: 2026-10-29
updated: 2026-10-29
summary: Quatro avisos novos no celular (visita em 1h, cliente respondeu, lead parado 48h, senha vencendo) rodando no tique dos follow-ups com claim antes do envio; ADM da plataforma ganha plano/suspensão, equipe de qualquer grupo e gestão de outros ADMs.
---

# Notificações novas no celular e poderes do ADM

**Pedido (29/10/2026):** notificações a mais no app; "dê mais permissões
para o ADM (eu e o Goes)".

## Notificações (0236)

- Tudo no tique de `/api/cron/followups` (pg_cron a cada 5 min), sem cron
  novo; "cliente respondeu" sai do webhook, no ramo em que a IA fica calada,
  via `after()`.
- **Claim antes do envio** em coluna própria (`visitas.lembrete_1h_para`,
  `leads.aviso_cliente_respondeu_em`, `leads.aviso_parado_em`,
  `corretores.aviso_senha_em`): dois tiques simultâneos não mandam dois.
  O lembrete de visita guarda o `inicio` lembrado — remarcou, lembra de novo.
- Lead parado: 48h a 7 dias sem contato nosso, 8h–20h de São Paulo, 1 por
  lead por dia, teto de 3 por corretor por dia (`leads_parados_para_aviso`,
  ~150 ms em 29/10 com 17 candidatos).
- Senha vencendo: 7 dias antes, uma por dia, às 9h (lê `listUsers`).
- Botão "Enviar notificação de teste" no Perfil (só para os aparelhos do
  próprio usuário).

## Poderes do ADM da plataforma (0237)

- Cartão "Situação e plano" no grupo: suspender/reativar (com confirmação)
  e mudar plano (`mudarPlanoDoGrupo`, imediato; Next Home recusada).
- Equipe de qualquer grupo: desativar/reativar e trocar papel, sempre
  filtrado pelo grupo da página, recusando grupo sem gestor ativo. Não move
  leads (o ADM não lê lead); avisa o gestor.
- `/plataforma/administradores`: adicionar (cria login com senha temporária
  forte se preciso), remover (nunca a si mesmo nem o último).
- ADM sem ficha criado com senha temporária: `app_metadata.deve_trocar_senha`.
  **Armadilha:** desligar essa marca e gravar `senha_trocada_em` precisam ir
  na MESMA escrita do `app_metadata`; em duas, a segunda regrava o objeto lido
  antes e religa a marca.
- **Entrar no painel de qualquer imobiliária ficou de fora** de propósito:
  conflita com "ADM nunca lê conversa" ([[plataforma-multi-grupo]]) e exige
  mudar a RLS de tudo. Próxima rodada, com desenho próprio.

Ver [[login-por-usuario-senha-forte-e-validade]].

## Avisos dos atendimentos no celular do ADM (29/10/2026, 17h)

Pedido: "todos os atendimentos que tivermos, faça a notificação cair na nossa
conta (adm do sistema)".

- **Armadilha:** o ADM da plataforma não tem ficha de corretor, e
  `inscricoes_push` exige `corretor_id`/`grupo_id` — nenhum aviso chegava a
  ele. Agora: `inscricoes_push_da_plataforma` (0239, global, dono = usuário do
  Auth) + `notificarAdminsDaPlataforma` (só para quem AINDA está em
  `administradores_da_plataforma`). Liga/testa no cartão "Avisos da Astro no
  celular" da /plataforma (`/api/plataforma/notificacoes`).
- Avisam: pedido de contratação; conta nova; conta suspensa/reativada à mão;
  resumo das mensalidades em aberto às 9h (tique dos follow-ups, minuto < 5).
  Suporte/contato: rodada seguinte (chamados).
- A guarda `servicoComGrupo.test.ts` exige, em `agrega-por-grupo`, o laço
  literal `for (const { id: grupoId } of grupos)`.

