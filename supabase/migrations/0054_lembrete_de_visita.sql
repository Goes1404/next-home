-- Lembrete de visita na véspera (roadmap do chatbot, item 7).
--
-- Reusa a infraestrutura dos follow-ups (tabela, runner de 5 min, cota
-- anti-ban, revalidações) em vez de criar uma fila nova: a única diferença
-- estrutural é O QUE a mensagem faz, e isso vira uma coluna `tipo`.
--
-- Três regras que a coluna carrega (aplicadas no código):
-- - o teto de 2 follow-ups por conversa vale só para 'reengajamento' —
--   lembrete de visita não é insistência, é serviço;
-- - resposta do cliente cancela reengajamento pendente, mas NUNCA o
--   lembrete: responder "ok!" não desmarca a visita de amanhã;
-- - lembrete é revalidado contra `leads.visita_agendada_em` na hora do
--   envio — visita desmarcada ou movida descarta o lembrete velho.

alter table public.whatsapp_followups
  add column if not exists tipo text not null default 'reengajamento'
    check (tipo in ('reengajamento', 'lembrete_visita'));

-- O agendador procura "existe lembrete para esta conversa?" a cada tique.
create index if not exists whatsapp_followups_tipo_conversa_idx
  on public.whatsapp_followups (tipo, conversa_id);
