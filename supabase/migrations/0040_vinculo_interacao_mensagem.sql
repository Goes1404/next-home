-- 0040 — Vínculo interação↔mensagem: torna avaliável QUALQUER resposta do bot
--
-- O botão 👍/👎 coletou zero rótulos, e a causa estrutural estava aqui:
-- `ia_interacoes` não guardava nem o texto da resposta nem o id da mensagem
-- que ela virou. Sem vínculo, só dava para avaliar "a última resposta da
-- conversa" (order by created_at desc limit 1) — se o bot respondeu cinco
-- vezes e a terceira foi ruim, o rótulo mais valioso que existe era
-- impossível de gravar.
--
-- O vínculo mora no lado da MENSAGEM (não como array na interação) porque é
-- a mensagem que o Live Chat lê: avaliar um balão entrega o alvo direto,
-- sem query por array. O id da interação passa a ser gerado pelo webhook
-- ANTES do envio, carimbado na mensagem e usado no insert da telemetria.

alter table public.whatsapp_mensagens
  add column if not exists interacao_id uuid references public.ia_interacoes(id) on delete set null;

create index if not exists whatsapp_mensagens_interacao_idx
  on public.whatsapp_mensagens (interacao_id)
  where interacao_id is not null;

-- Índice da fila de revisão: interações respondidas ainda sem avaliação.
create index if not exists ia_interacoes_sem_avaliacao_idx
  on public.ia_interacoes (corretor_id, created_at desc)
  where avaliacao is null and acao in ('respondida', 'visita_confirmada');

-- Backfill aproximado das respostas que já existem: casa cada interação
-- com a mensagem de bot mais próxima na mesma conversa. A janela é
-- [-3 min, +30 s] porque a mensagem é gravada ANTES da linha de telemetria
-- (entre as duas ficam a extração do dossiê, ~12 s, e os avisos ao
-- corretor). O row_number desempata quando duas interações disputam a
-- mesma mensagem: vence a de menor distância no tempo; a perdedora fica
-- sem vínculo, o que é honesto — melhor sem rótulo do que rótulo no balão
-- errado.
with candidatas as (
  select
    i.id as interacao_id,
    m.id as mensagem_id,
    row_number() over (
      partition by m.id
      order by abs(extract(epoch from (m.created_at - i.created_at)))
    ) as rn
  from public.ia_interacoes i
  cross join lateral (
    select m2.id, m2.created_at
    from public.whatsapp_mensagens m2
    where m2.conversa_id = i.conversa_id
      and m2.remetente = 'bot'
      and m2.interacao_id is null
      and m2.created_at between i.created_at - interval '3 minutes'
                            and i.created_at + interval '30 seconds'
    order by abs(extract(epoch from (m2.created_at - i.created_at)))
    limit 1
  ) m
  where i.conversa_id is not null
    and i.origem in ('webhook', 'followup')
    and i.acao in ('respondida', 'visita_confirmada')
)
update public.whatsapp_mensagens m
set interacao_id = c.interacao_id
from candidatas c
where m.id = c.mensagem_id
  and c.rn = 1
  and m.interacao_id is null;
