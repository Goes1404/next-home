-- 0223: mensagens do WhatsApp só são gravadas pela chave de serviço (27/10/2026).
--
-- A trava de primeiro contato (0217/0222) decide pelas MENSAGENS: conversa sem
-- fala do cliente antes da nossa é primeiro contato. Com INSERT/UPDATE/DELETE
-- liberados ao `authenticated`, um corretor podia, pela API com a própria
-- sessão, gravar uma "fala do cliente" falsa na conversa dele, ou apagar o que
-- saiu do número, e furar o teto que protege o WhatsApp do banimento.
--
-- Ninguém grava pela sessão: o webhook, o disparador, o Live Chat e a
-- importação de histórico usam a chave de serviço; o painel só LÊ (consultas e
-- Realtime, que precisa só do SELECT). Pelo mesmo motivo a conversa não é
-- apagada pela sessão (o `on delete cascade` levaria as mensagens junto).

begin;

set local lock_timeout = '5s';

revoke insert, update, delete, truncate on table public.whatsapp_mensagens from anon, authenticated;
revoke delete, truncate on table public.whatsapp_conversas from anon, authenticated;

commit;
