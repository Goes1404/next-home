-- 0163 — A visita que o corretor combina no chat vira sugestão (A2, 06/10/2026).
--
-- Com a IA calada, o corretor marca a visita de cabeça ("combinado, sábado
-- às 10") e o CRM não fica sabendo: a visita não entra na agenda, o lembrete
-- de véspera não sai e o funil fica parado. O webhook reconhece o combinado
-- (`visitaCombinadaNoChat`) e guarda a data aqui; o Início mostra "Registrar
-- a visita?" e só um toque do corretor grava em `leads.visita_agendada_em`.
-- Nunca grava sozinho: a fala pode ser sobre outra coisa, e só ele sabe.
--
-- Quem escreve é o servidor (chave de serviço). O corretor lê pela policy que
-- a tabela já tem.

alter table public.whatsapp_conversas
  add column if not exists visita_sugerida_para timestamptz,
  add column if not exists visita_sugerida_em timestamptz;

comment on column public.whatsapp_conversas.visita_sugerida_para is
  'Data da visita que o corretor parece ter combinado no chat, esperando ele confirmar no Início (0163). Null depois de registrar ou dispensar.';

create index if not exists whatsapp_conversas_visita_sugerida_idx
  on public.whatsapp_conversas (corretor_id, visita_sugerida_em)
  where visita_sugerida_para is not null;
