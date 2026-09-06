-- Estado do ciclo — a medição semanal que o ROADMAP.md pede (métricas-norte)
-- e o diagnóstico de "por que nada está saindo", num arquivo só.
--
-- POR QUE ESTE ARQUIVO EXISTE: em 31/08/2026 descobriu-se, por uma
-- investigação ad-hoc, que o número de WhatsApp estava fora do ar havia TRÊS
-- DIAS — fila parada, zero mensagens, zero avisos. Nada no sistema apontava
-- para isso; foi preciso reescrever à mão as mesmas consultas que já tinham
-- sido escritas em agosto. Régua da casa: descoberta que custou uma sessão
-- não pode custar duas.
--
-- COMO RODAR: cole no SQL Editor do Supabase (ou via MCP/psql). É SÓ
-- LEITURA — nenhum `insert`, `update` ou `delete`. Pode rodar em produção a
-- qualquer hora.
--
-- COMO LER: os blocos estão na ordem em que a resposta costuma aparecer.
-- Se o bloco 1 acusar problema, os outros são consequência — conserte ele
-- primeiro e remeça.

-- ---------------------------------------------------------------------------
-- 1. O NÚMERO ESTÁ NO AR?  (se não estiver, nada mais importa)
-- ---------------------------------------------------------------------------
-- A ordem das colunas é a ordem de diagnóstico registrada na MEMORIA:
-- conectado_em (null = nada sai, nunca) -> bloqueado_ate (disjuntor) ->
-- contador vs. cota do dia -> proximo_envio_permitido_em (trava da 0062).
select
  i.instance_name,
  i.status_conexao,
  i.conectado_em          at time zone 'America/Sao_Paulo' as conectado_sp,
  i.bloqueado_ate         at time zone 'America/Sao_Paulo' as disjuntor_ate_sp,
  i.bloqueado_ate > now()                                  as disjuntor_aberto_agora,
  i.falhas_seguidas,
  i.envios_campanha_data,
  i.envios_campanha_contador,
  i.proximo_envio_permitido_em at time zone 'America/Sao_Paulo' as proxima_vaga_sp,
  case
    when i.conectado_em is null      then 'PARADO: número nunca foi pareado'
    when i.status_conexao <> 'conectado' then 'PARADO: número caiu — ' || i.status_conexao
    when i.bloqueado_ate > now()     then 'PARADO: disjuntor aberto'
    else 'ok'
  end as veredito
from public.corretor_whatsapp_instancias i
order by i.instance_name;

-- ---------------------------------------------------------------------------
-- 2. HÁ QUANTO TEMPO NADA ACONTECE?
-- ---------------------------------------------------------------------------
-- Silêncio longo aqui, com o bloco 1 dizendo "ok", é sinal de fila vazia —
-- não de defeito. Com o bloco 1 acusando, é a duração do apagão.
select
  (select max(enviado_em)  at time zone 'America/Sao_Paulo' from public.whatsapp_campanhas_fila)                              as ultimo_disparo_sp,
  (select max(created_at)  at time zone 'America/Sao_Paulo' from public.whatsapp_mensagens where remetente = 'cliente')       as ultima_fala_de_cliente_sp,
  (select max(created_at)  at time zone 'America/Sao_Paulo' from public.whatsapp_mensagens where remetente = 'bot')           as ultima_fala_do_bot_sp,
  now() at time zone 'America/Sao_Paulo'                                                                                     as agora_sp;

-- ---------------------------------------------------------------------------
-- 3. O ESPAÇAMENTO ANTI-BAN ESTÁ VALENDO?  (a prova da 0062)
-- ---------------------------------------------------------------------------
-- A rajada NÃO aparece em `agendado_para`, que continua perfeito mesmo
-- quando tudo saiu junto: ela só aparece comparando `enviado_em` com o
-- `lag(enviado_em)` da mesma campanha. `abaixo_de_30s` é a medida que
-- importa e, depois da 0062, tem de ser ZERO.
--
-- Linha de base medida em 31/08/2026, ANTES de a correção ser exercitada:
--   16 de 18 intervalos abaixo de 30s, mediana de 4s, menor de 3s.
with envios as (
  select
    campanha_id,
    enviado_em,
    extract(epoch from (
      enviado_em - lag(enviado_em) over (partition by campanha_id order by enviado_em)
    )) as intervalo_s
  from public.whatsapp_campanhas_fila
  where status in ('enviado', 'respondido') and enviado_em is not null
)
select
  count(*) filter (where intervalo_s is not null)                       as intervalos_medidos,
  count(*) filter (where intervalo_s < 30)                              as abaixo_de_30s,
  round(min(intervalo_s))                                               as menor_s,
  round(percentile_cont(0.5) within group (order by intervalo_s))       as mediana_s,
  min(enviado_em) at time zone 'America/Sao_Paulo'                      as primeiro_sp,
  max(enviado_em) at time zone 'America/Sao_Paulo'                      as ultimo_sp
from envios;

-- ---------------------------------------------------------------------------
-- 4. POR QUE A FILA ESTÁ PARADA?
-- ---------------------------------------------------------------------------
-- `erro_motivo` num item PENDENTE é a pista mais valiosa do sistema: é a
-- falha que ainda vai ser retentada, e é ela que alimenta o disjuntor.
-- ("Número não está no WhatsApp" é dado ruim do lead e NÃO conta para o
-- disjuntor; qualquer outra coisa conta.)
select
  f.status,
  coalesce(f.erro_motivo, '(sem motivo — nunca tentado)') as motivo,
  f.tentativas,
  count(*) as itens,
  min(f.agendado_para) at time zone 'America/Sao_Paulo' as mais_antigo_sp
from public.whatsapp_campanhas_fila f
where f.status in ('pendente', 'erro')
group by f.status, motivo, f.tentativas
order by itens desc;

-- ---------------------------------------------------------------------------
-- 5. AS MÉTRICAS-NORTE DO ROADMAP
-- ---------------------------------------------------------------------------
-- Duas armadilhas já documentadas estão embutidas aqui:
--   - `ia_interacoes` só conta como RESPOSTA quando `acao = 'respondida'`
--     E `modelo is not null` — sem isso a tabela conta o silêncio de um bot
--     pausado como atendimento;
--   - conversa em que só o BOT falou não é atendimento. Por isso a coluna
--     que manda é `conversas_com_2mais_falas_do_cliente`, não o total.
-- ATENÇÃO ao comparar: este bloco conta a VIDA INTEIRA. Boa parte das
-- conversas com fala do cliente é anterior ao bot atender (eram do
-- corretor). Para medir o atendimento de agora, recorte por período — em
-- 31/08 o número era 46 na vida e apenas 3 entre as 55 conversas em que o
-- bot falou desde 25/08.
select
  (select count(*) from public.whatsapp_mensagens where remetente = 'bot')                                          as msgs_do_bot_gravadas,
  (select count(*) from public.ia_interacoes where acao = 'respondida' and modelo is not null)                      as respostas_reais,
  (select count(*) from public.ia_interacoes where acao = 'respondida' and modelo is not null
      and coalesce(e_teste, false) = false)                                                                          as respostas_fora_de_teste,
  (select count(*) from public.whatsapp_conversas c
     where (select count(*) from public.whatsapp_mensagens m
              where m.conversa_id = c.id and m.remetente = 'cliente') >= 2)                                          as conversas_com_2mais_falas_do_cliente,
  (select count(*) from public.ia_interacoes where avaliacao is not null)                                            as rotulos_humanos,
  (select count(*) from public.leads where visita_agendada_em is not null)                                           as visitas_marcadas,
  (select count(*) from public.whatsapp_followups where status = 'enviado')                                          as followups_enviados,
  (select count(*) from public.lead_observacoes_ia)                                                                  as dossies,
  (select count(*) from public.leads where arquivado_em is null)                                                     as leads_ativos,
  (select count(*) from public.leads where arquivado_em is null
      and (renda_mensal is not null or orcamento_min is not null or orcamento_max is not null))                       as leads_com_renda_ou_orcamento;

-- ---------------------------------------------------------------------------
-- 6. A CAMPANHA CONVERTE?
-- ---------------------------------------------------------------------------
-- Medido em 31/08/2026: 88 entregues, 1 resposta (1,1%). Taxa assim não é
-- defeito de IA — a IA nem chega a conversar. É a mensagem de abertura, a
-- lista ou o horário. Vale acompanhar como campanha de marketing.
select
  count(*) filter (where status in ('enviado', 'respondido')) as entregues,
  count(*) filter (where status = 'respondido')               as responderam,
  round(
    100.0 * count(*) filter (where status = 'respondido')
    / nullif(count(*) filter (where status in ('enviado', 'respondido')), 0)
  , 1)                                                        as taxa_de_resposta_pct,
  count(*) filter (where status = 'erro')                     as erros,
  count(*) filter (where status = 'pendente')                 as pendentes
from public.whatsapp_campanhas_fila;

-- ---------------------------------------------------------------------------
-- 7. CONVERSA QUE MORRE POR CAUSA NOSSA
-- ---------------------------------------------------------------------------
-- `fallback = true` é a contingência: o cliente recebeu o texto de espera
-- em vez de uma resposta. Agrupado por versão de prompt porque contador
-- acumulado mistura defeito de hoje com defeito já corrigido — a armadilha
-- dos "12 anexos barrados" que eram todos da era v2-v7.
select
  prompt_versao,
  count(*)                                        as interacoes,
  count(*) filter (where fallback)                as em_contingencia,
  count(*) filter (where anexos_bloqueados > 0)   as com_anexo_barrado,
  round(avg(latencia_ms))                         as latencia_media_ms,
  max(created_at) at time zone 'America/Sao_Paulo' as ultima_sp
from public.ia_interacoes
where modelo is not null
group by prompt_versao
order by ultima_sp desc nulls last
limit 10;
