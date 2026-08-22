-- 0026 — Religa conversa ↔ lead
--
-- Em produção NENHUMA das 32 conversas tinha lead_id: o vínculo casava o
-- telefone do JID do WhatsApp (só dígitos, ex. 5511988881111) com
-- leads.telefone digitado à mão no formulário ("11 98888-1111"), por
-- igualdade exata — nunca casa. Consequência silenciosa: zero dossiês
-- persistidos, few-shot sem exemplos, alerta de lead quente parcialmente
-- morto. leads.telefone_e164 (0022) existe e está 100% preenchido — e é
-- armazenado SÓ COM DÍGITOS (sem '+'), o mesmo formato do JID. É ele o
-- campo de casamento. O código novo (obterOuCriarConversa) usa e164 com
-- variantes de nono dígito; este backfill conserta o estoque.

-- Passada 1: e164 exato (ambos só-dígitos)
update whatsapp_conversas c
set lead_id = l.id
from leads l
where c.lead_id is null
  and l.corretor_id = c.corretor_id
  and l.telefone_e164 = c.telefone_cliente;

-- Passada 2: JID sem o nono dígito vs. cadastro com ele (e vice-versa).
-- Celular BR antigo: +55 DD 9XXXXXXXX ↔ +55 DD XXXXXXXX.
update whatsapp_conversas c
set lead_id = l.id
from leads l
where c.lead_id is null
  and l.corretor_id = c.corretor_id
  and length(c.telefone_cliente) = 12  -- 55 + DD + 8 dígitos (sem o 9)
  and l.telefone_e164 = substr(c.telefone_cliente, 1, 4) || '9' || substr(c.telefone_cliente, 5);

update whatsapp_conversas c
set lead_id = l.id
from leads l
where c.lead_id is null
  and l.corretor_id = c.corretor_id
  and length(c.telefone_cliente) = 13  -- 55 + DD + 9 + 8 dígitos
  and l.telefone_e164 = substr(c.telefone_cliente, 1, 4) || substr(c.telefone_cliente, 6);

-- Debounce do alerta de lead quente: sem este carimbo, toda mensagem de uma
-- conversa com score >= 75 mandava um alerta novo ao corretor — spam que
-- ensina a ignorar o alerta.
alter table whatsapp_conversas
  add column if not exists alerta_quente_em timestamptz;
