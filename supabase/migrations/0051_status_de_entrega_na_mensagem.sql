-- 0051: ✓✓ do Live Chat — status de entrega nas mensagens ENVIADAS
--
-- Só para mensagem que NÓS mandamos com `provider_message_id` conhecido
-- (hoje: o envio pelo painel, que é 1 mensagem = 1 chamada ao provedor).
-- Os balões do bot são N chamadas para UMA linha gravada — carimbar o ack
-- de um balão na linha inteira seria um tick que mente, e tick que mente é
-- pior que tick nenhum.
--
-- O ack chega pelo evento MESSAGES_UPDATE da Evolution e casa pela chave
-- `provider_message_id` (o índice único da 0027 já cobre a busca). A
-- progressão é monotônica (enviada → entregue → lida) e o webhook garante
-- isso na aplicação — ack fora de ordem não rebaixa "lida" para "entregue".

alter table public.whatsapp_mensagens
  add column if not exists status_entrega text
    check (status_entrega in ('enviada', 'entregue', 'lida'));
