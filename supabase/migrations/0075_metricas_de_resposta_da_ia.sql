-- 0075 — As duas métricas-norte que não tinham tela (roadmap geral, H3.2)
--
-- O `ROADMAP.md` lista cinco métricas-norte "para medir toda semana". Duas
-- delas nunca existiram em tela nenhuma, embora o dado esteja no banco
-- desde sempre:
--
--   1. **Cobertura** — leads atendidos pela IA ÷ leads que escreveram.
--   3. **Tempo até a primeira resposta** (meta: menos de 5s).
--
-- Medido em 01/09/2026, antes de existir a tela: de **56 conversas em que
-- o cliente falou, a IA respondeu 12** — 21% de cobertura. Quando responde,
-- porém, responde rápido: mediana de **9 segundos**, 8 das 12 em menos de um
-- minuto. Cobertura baixa e velocidade boa é um diagnóstico completamente
-- diferente de "a IA está lenta", e nenhuma tela dizia isso.
--
-- ## Mediana, não média nem p90
--
-- O p90 desta base é de quase três dias: há conversa em que o bot só falou
-- muito depois (a trava de palavra-chave sendo liberada, o disparo de
-- campanha entrando na conversa antiga). Uma média ou um p90 com esse
-- vizinho descreveria um sistema lento que não existe. A mediana é robusta
-- a isso, e o "quantas em até 1 minuto" diz o resto sem precisar de cauda.
--
-- ## O que conta como "atendida"
--
-- A primeira fala do BOT DEPOIS da primeira fala do cliente. Mensagem de
-- campanha que abre a conversa não conta como resposta — ela veio antes de
-- o cliente dizer qualquer coisa, e chamá-la de atendimento infla a
-- cobertura justamente onde ela é o número que importa.

create or replace view public.whatsapp_resposta_metricas as
with primeira_do_cliente as (
  select m.conversa_id, min(m.created_at) as t_cliente
    from public.whatsapp_mensagens m
   where m.remetente = 'cliente'
   group by m.conversa_id
),
primeira_resposta as (
  select m.conversa_id, min(m.created_at) as t_bot
    from public.whatsapp_mensagens m
    join primeira_do_cliente p on p.conversa_id = m.conversa_id
   where m.remetente = 'bot'
     and m.created_at > p.t_cliente
   group by m.conversa_id
)
select
  c.corretor_id,
  count(*) as conversas_com_fala_do_cliente,
  count(r.conversa_id) as conversas_atendidas,
  round(
    percentile_cont(0.5) within group (
      order by extract(epoch from (r.t_bot - p.t_cliente))
    )
  )::integer as mediana_segundos,
  count(*) filter (
    where extract(epoch from (r.t_bot - p.t_cliente)) <= 60
  ) as atendidas_em_ate_60s
from primeira_do_cliente p
  join public.whatsapp_conversas c on c.id = p.conversa_id
  left join primeira_resposta r on r.conversa_id = p.conversa_id
group by c.corretor_id;

comment on view public.whatsapp_resposta_metricas is
  'Cobertura e tempo ate a primeira resposta da IA, por corretor. Mediana (nao media) porque a cauda desta base tem conversa respondida dias depois (0075).';
