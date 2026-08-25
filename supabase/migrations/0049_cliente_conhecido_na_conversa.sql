-- A conversa passa a lembrar se o cliente já era do CRM.
--
-- A F3 decide, no nascimento da conversa, se a IA atende na hora (o
-- telefone já tinha lead antes) ou espera a palavra-chave (número
-- desconhecido). Só que a decisão precisa ser lembrada, e por dois motivos:
--
-- 1. **A IA tem de VOLTAR sozinha.** Hoje qualquer fala do corretor pausa
--    24h E RETRAVA a conversa — na prática, ela não volta nunca mais. Para
--    cliente conhecido isso é errado: o corretor responder uma vez não
--    significa que ele quer atender aquele lead para sempre. A pausa vence,
--    a IA volta. Para número desconhecido a trava continua valendo inteira,
--    porque é ela que protege a conversa da família (a instância roda no
--    WhatsApp pessoal do corretor).
--
-- 2. **Recalcular a cada mensagem sairia errado.** O critério é "o lead
--    existia ANTES desta conversa" — e o webhook CRIA o lead de quem
--    escreve. Um dia depois, todo telefone tem lead: a comparação de datas
--    continua funcionando, mas custa um join por mensagem para responder
--    algo que nunca muda. Decisão tomada uma vez, no insert.

alter table public.whatsapp_conversas
  add column if not exists cliente_conhecido boolean not null default false;

comment on column public.whatsapp_conversas.cliente_conhecido is
  'O telefone já tinha lead no CRM ANTES desta conversa (importado, formulário do site, cadastro manual). Decidido no insert por obterOuCriarConversa. Cliente conhecido é atendido sem palavra-chave e a IA volta sozinha quando a pausa vence.';

-- Backfill pelo mesmo critério, agora olhando as datas de verdade: o lead
-- nasceu antes da conversa. Quem foi criado pelo próprio webhook tem as
-- duas datas praticamente coladas, então a folga de 1 minuto separa
-- "cadastrado antes" de "criado por esta conversa".
update public.whatsapp_conversas c
set cliente_conhecido = true
from public.leads l
where l.id = c.lead_id
  and l.created_at < c.created_at - interval '1 minute';
