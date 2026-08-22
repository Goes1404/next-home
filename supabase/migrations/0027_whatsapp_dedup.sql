-- 0027 — Deduplicação de webhook
--
-- Todo provedor de WhatsApp reentrega webhooks (timeout, retry deles, restart
-- nosso). Sem registrar o id da mensagem do provedor, cada reentrega virava
-- resposta duplicada ao cliente e linha duplicada no histórico. O índice
-- único parcial é a trava: a segunda inserção do mesmo id falha e o webhook
-- devolve "reentrega" sem chamar a IA.
alter table whatsapp_mensagens
  add column if not exists provider_message_id text;

create unique index if not exists whatsapp_mensagens_provider_id_uidx
  on whatsapp_mensagens (provider_message_id)
  where provider_message_id is not null;
