-- 0147: a IA só responde (plano de ativação da IA, Fase 2, 03/10/2026).
--
-- Pós-visita e pedido de indicação deixam de sair sozinhos (regra N7): o
-- runner gera o texto e ele vira SUGESTÃO na fila do Início, com um botão
-- para o corretor enviar. O reengajamento automático saiu do código.

alter table public.whatsapp_followups
  drop constraint if exists whatsapp_followups_status_check;
alter table public.whatsapp_followups
  add constraint whatsapp_followups_status_check
    check (status in ('pendente', 'enviado', 'cancelado', 'descartado', 'sugerido'));

alter table public.whatsapp_followups
  add column if not exists texto_sugerido text,
  add column if not exists sugerido_em timestamptz;

comment on column public.whatsapp_followups.texto_sugerido is
  'Texto que a IA sugeriu para o corretor enviar (pós-visita e indicação, 0147). Só existe com status sugerido, ou enviado a partir de uma sugestão.';

-- A fila do Início lê as sugestões com a sessão do corretor. Até aqui a
-- tabela não tinha policy nenhuma: só o servidor a lia.
revoke all on public.whatsapp_followups from anon;
drop policy if exists "corretor le os follow-ups das suas conversas" on public.whatsapp_followups;
create policy "corretor le os follow-ups das suas conversas"
  on public.whatsapp_followups
  for select
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas c
      where c.id = whatsapp_followups.conversa_id
        and c.corretor_id = (select public.corretor_atual())
    )
  );

-- 2.5: desde a 0111 toda conversa nasce liberada e de cliente conhecido, e a
-- trava de liberação só sobrava em conversas antigas. Libera as que ainda
-- estão travadas. A IA continua desligada onde `bot_ativo` é false (as
-- conversas contidas pela 0144 seguem caladas).
update public.whatsapp_conversas
  set liberado_por_palavra_chave = true,
      cliente_conhecido = true
  where lead_id is not null
    and (not liberado_por_palavra_chave or not cliente_conhecido);
