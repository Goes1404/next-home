-- Relatório de uso da semana — o que a equipe fez na plataforma.
--
-- POR QUE ESTE ARQUIVO EXISTE: em 10/10/2026 o dono pediu "o relatório de uso
-- da última semana" e as consultas tiveram de ser escritas do zero, com três
-- armadilhas no caminho (perfil demo, mensagens do bot que não são da IA e
-- robôs nos cliques). Ver vault/10-notas/primeira-semana-em-producao.md.
--
-- COMO RODAR: SQL Editor do Supabase (ou MCP). Só leitura. Troque as duas
-- datas do bloco `p` em cada consulta (meia-noite de São Paulo).
--
-- TRÊS REGRAS PARA OS NÚMEROS NÃO MENTIREM:
-- 1. Fora o perfil de demonstração: corretor com slug 'demo-%'. O seed de
--    07/10 pôs leads e mensagens no passado, mas visita_marcada_em (trigger)
--    e vendas.created_at ficaram no dia do seed: sem o filtro, a semana de
--    03 a 09/10 teria 19 visitas e 39 vendas em vez de 1 e 0.
-- 2. Mensagem com remetente 'bot' é IA + lista de transmissão + lembrete. A
--    IA se conta em ia_interacoes (acao = 'respondida'); a lista, na fila
--    (enviado_em).
-- 3. Clique em /wa conta robô: o da Meta montando prévia e os de IA
--    (ClaudeBot, GPTBot, MJ12bot) seguindo os botões do site. Contar
--    pessoas distintas (coluna visitante), nunca o total.

-- ---------------------------------------------------------------------------
-- 1. POR DIA
-- ---------------------------------------------------------------------------
with p as (select timestamptz '2026-10-03 00:00-03' ini, timestamptz '2026-10-10 00:00-03' fim),
cor as (select id from corretores where coalesce(slug, '') not like 'demo-%'),
dias as (select generate_series((select ini from p) at time zone 'America/Sao_Paulo',
                                (select fim from p) at time zone 'America/Sao_Paulo' - interval '1 day',
                                interval '1 day')::date dia)
select d.dia,
  (select count(*) from leads l where l.corretor_id in (select id from cor)
     and (l.created_at at time zone 'America/Sao_Paulo')::date = d.dia) leads,
  (select count(*) from whatsapp_mensagens m join whatsapp_conversas w on w.id = m.conversa_id
     where w.corretor_id in (select id from cor) and m.remetente = 'cliente'
       and (m.created_at at time zone 'America/Sao_Paulo')::date = d.dia) msgs_cliente,
  (select count(*) from whatsapp_mensagens m join whatsapp_conversas w on w.id = m.conversa_id
     where w.corretor_id in (select id from cor) and m.remetente = 'corretor'
       and (m.created_at at time zone 'America/Sao_Paulo')::date = d.dia) msgs_corretor,
  (select count(*) from ia_interacoes i where i.corretor_id in (select id from cor)
     and i.acao = 'respondida' and not coalesce(i.e_teste, false)
     and (i.created_at at time zone 'America/Sao_Paulo')::date = d.dia) ia_respostas,
  (select count(*) from whatsapp_campanhas_fila f join whatsapp_campanhas c on c.id = f.campanha_id
     where c.corretor_id in (select id from cor)
       and (f.enviado_em at time zone 'America/Sao_Paulo')::date = d.dia) lista_enviadas
from dias d order by d.dia;

-- ---------------------------------------------------------------------------
-- 2. POR CORRETOR
-- ---------------------------------------------------------------------------
with p as (select timestamptz '2026-10-03 00:00-03' ini, timestamptz '2026-10-10 00:00-03' fim),
cor as (select id, nome from corretores where coalesce(slug, '') not like 'demo-%')
select cor.nome,
  (select count(*) from leads l where l.corretor_id = cor.id and l.created_at >= p.ini and l.created_at < p.fim) leads_novos,
  (select count(distinct m.conversa_id) from whatsapp_mensagens m join whatsapp_conversas w on w.id = m.conversa_id
     where w.corretor_id = cor.id and m.remetente = 'cliente' and m.created_at >= p.ini and m.created_at < p.fim) clientes_que_falaram,
  (select count(*) from whatsapp_mensagens m join whatsapp_conversas w on w.id = m.conversa_id
     where w.corretor_id = cor.id and m.remetente = 'corretor' and m.created_at >= p.ini and m.created_at < p.fim) msgs_corretor,
  (select count(*) from ia_interacoes i where i.corretor_id = cor.id and i.acao = 'respondida'
     and not coalesce(i.e_teste, false) and i.created_at >= p.ini and i.created_at < p.fim) ia_respostas,
  (select count(*) from whatsapp_campanhas_fila f join whatsapp_campanhas c on c.id = f.campanha_id
     where c.corretor_id = cor.id and f.enviado_em >= p.ini and f.enviado_em < p.fim) lista_enviadas,
  (select count(*) from whatsapp_campanhas_fila f join whatsapp_campanhas c on c.id = f.campanha_id
     where c.corretor_id = cor.id and f.resposta_em >= p.ini and f.resposta_em < p.fim) lista_respostas,
  (select count(*) from leads l where l.corretor_id = cor.id and l.visita_marcada_em >= p.ini and l.visita_marcada_em < p.fim) visitas_marcadas
from cor cross join p
order by 2 desc;

-- ---------------------------------------------------------------------------
-- 3. TEMPO DE RESPOSTA (por vez do cliente: a 1ª fala depois de uma nossa)
-- ---------------------------------------------------------------------------
with p as (select timestamptz '2026-10-03 00:00-03' ini, timestamptz '2026-10-10 00:00-03' fim),
cor as (select id from corretores where coalesce(slug, '') not like 'demo-%'),
vez as (
  select m.conversa_id, m.created_at
  from whatsapp_mensagens m join whatsapp_conversas w on w.id = m.conversa_id, p
  where w.corretor_id in (select id from cor) and not coalesce(w.e_teste, false)
    and m.remetente = 'cliente' and m.created_at >= p.ini and m.created_at < p.fim
    and coalesce((select m2.remetente from whatsapp_mensagens m2 where m2.conversa_id = m.conversa_id
                  and m2.created_at < m.created_at order by m2.created_at desc limit 1), 'x') <> 'cliente'
),
resp as (
  select v.*, r.created_at resp_em, r.remetente quem
  from vez v left join lateral (
    select m3.created_at, m3.remetente from whatsapp_mensagens m3
    where m3.conversa_id = v.conversa_id and m3.created_at > v.created_at and m3.remetente <> 'cliente'
    order by m3.created_at limit 1) r on true
)
select count(*) vezes,
  count(*) filter (where quem = 'bot') pela_ia,
  count(*) filter (where quem = 'corretor') pelo_corretor,
  count(*) filter (where resp_em is null) sem_resposta,
  round(percentile_cont(0.5) within group (order by extract(epoch from resp_em - created_at))
        filter (where resp_em is not null)::numeric, 0) mediana_segundos
from resp;

-- ---------------------------------------------------------------------------
-- 4. CLIQUES NO WHATSAPP (anúncio e site), sem robôs
-- ---------------------------------------------------------------------------
with p as (select timestamptz '2026-10-03 00:00-03' ini, timestamptz '2026-10-10 00:00-03' fim),
c as (
  select c.*, case when c.origem like 'anuncio%' then 'anuncio' else 'site' end canal,
    (c.user_agent is null or c.user_agent ilike any (array['%facebookexternalhit%', '%bot%', '%crawl%', '%spider%', '%headless%'])) robo
  from cliques_whatsapp c, p where c.created_at >= p.ini and c.created_at < p.fim
)
select canal, count(*) total, count(*) filter (where robo) robos,
  count(distinct visitante) filter (where not robo) pessoas,
  count(*) filter (where lead_id is not null) viraram_lead
from c group by canal;

-- ---------------------------------------------------------------------------
-- 5. NÚMEROS AGORA
-- ---------------------------------------------------------------------------
select c.nome, i.status_conexao,
  to_char(i.conectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') conectado_em,
  to_char(i.desconectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') desconectado_em,
  i.falhas_seguidas,
  to_char(i.bloqueado_ate at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') bloqueado_ate
from corretor_whatsapp_instancias i join corretores c on c.id = i.corretor_id
order by c.nome;
