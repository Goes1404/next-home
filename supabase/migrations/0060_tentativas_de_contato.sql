-- Quantas vezes já tentamos falar com este lead.
--
-- ## Por que uma coluna e não uma conta na leitura
--
-- A regra desta base é o contrário: mensagem de WhatsApp NÃO é copiada para
-- `lead_interacoes` porque duas verdades divergem, e a linha do tempo
-- mescla as fontes no momento da leitura. Aqui a decisão inverte, e o
-- motivo é escala: a lista de leads é paginada (30 por página) e o quadro
-- do funil chega a 300 cartões. Contar disparos, follow-ups e mensagens por
-- lead a cada render seria uma consulta por linha na tela mais aberta do
-- painel. Contador é barato de ler e o que ele guarda é FATO ("tentamos
-- falar N vezes"), não julgamento — julgamento é o que esta base se recusa
-- a automatizar.
--
-- ## São DUAS contagens, e a diferença é o que decide ação
--
--   * `tentativas_contato`      — total na vida. Nunca diminui. É o
--     histórico.
--   * `tentativas_sem_resposta` — quantas desde a última vez que o cliente
--     falou. **Zera quando ele responde.** É esta que responde "já insisti
--     demais aqui?", e é ela que serve para decidir parar.
--
-- Guardar só o total não resolveria: um lead com 6 tentativas que respondeu
-- todas é o melhor lead da carteira, e um com 3 sem nenhuma resposta é o
-- que precisa sair da fila. O mesmo número significaria coisas opostas.
--
-- ## O que conta como tentativa
--
-- Mensagem que NÓS iniciamos: disparo de campanha, follow-up automático e
-- mensagem que o corretor manda pelo Live Chat. A resposta da IA a quem
-- escreveu NÃO conta — responder não é tentar alcançar alguém, e contá-la
-- faria a conversa mais engajada parecer a mais insistente.

alter table public.leads
  add column if not exists tentativas_contato integer not null default 0,
  add column if not exists tentativas_sem_resposta integer not null default 0,
  add column if not exists ultima_tentativa_em timestamptz;

comment on column public.leads.tentativas_contato is
  'Total de contatos que NÓS iniciamos (campanha, follow-up, mensagem manual). Nunca diminui.';
comment on column public.leads.tentativas_sem_resposta is
  'Tentativas desde a última fala do cliente. Zera quando ele responde. É a que decide se vale insistir.';
comment on column public.leads.ultima_tentativa_em is
  'Quando saiu a última tentativa de contato.';

-- Incremento ATÔMICO, como as funções de cota (0034).
--
-- Ler-somar-gravar da aplicação perde contagem quando duas mensagens saem
-- no mesmo instante — e é exatamente isso que o disparador faz, com o cron,
-- a corrente e o botão do painel podendo tocar o mesmo lead. `security
-- definer` também evita depender de grant por coluna, que nesta tabela é
-- restritivo desde a 0007.
create or replace function public.registrar_tentativa_contato(p_lead_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.leads
     set tentativas_contato      = tentativas_contato + 1,
         tentativas_sem_resposta = tentativas_sem_resposta + 1,
         ultima_tentativa_em     = now()
   where id = p_lead_id;
$$;

-- O cliente falou: a insistência volta a zero.
--
-- O TOTAL não é tocado de propósito — ele é o histórico, e histórico que o
-- próprio sistema reescreve não é histórico.
create or replace function public.registrar_resposta_do_lead(p_lead_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.leads
     set tentativas_sem_resposta = 0
   where id = p_lead_id
     and tentativas_sem_resposta > 0;
$$;

revoke all on function public.registrar_tentativa_contato(uuid) from public, anon;
revoke all on function public.registrar_resposta_do_lead(uuid) from public, anon;
grant execute on function public.registrar_tentativa_contato(uuid) to service_role;
grant execute on function public.registrar_resposta_do_lead(uuid) to service_role;

-- Backfill: o que já aconteceu conta.
--
-- Sem isto o contador nasceria em zero para toda a base, e a primeira
-- pergunta que ele existe para responder ("já insisti demais aqui?") teria
-- a resposta errada justamente nos leads mais trabalhados. As duas fontes
-- são disparo de campanha entregue e follow-up enviado; mensagem manual do
-- Live Chat fica de fora porque não há como distinguir, no histórico, a que
-- o corretor mandou por iniciativa dele da que foi resposta a alguém.
with tentativas as (
  select f.lead_id, count(*)::int as n, max(f.enviado_em) as ultima
    from public.whatsapp_campanhas_fila f
   where f.status = 'enviado' and f.lead_id is not null
   group by f.lead_id
  union all
  select c.lead_id, count(*)::int as n, max(fu.enviado_em) as ultima
    from public.whatsapp_followups fu
    join public.whatsapp_conversas c on c.id = fu.conversa_id
   where fu.status = 'enviado' and c.lead_id is not null
   group by c.lead_id
),
somadas as (
  select lead_id, sum(n)::int as total, max(ultima) as ultima
    from tentativas group by lead_id
)
update public.leads l
   set tentativas_contato  = s.total,
       ultima_tentativa_em = s.ultima,
       -- Só conta como "sem resposta" quem NÃO falou depois da última
       -- tentativa. Quem respondeu já zerou na prática, e nascer com o
       -- total aqui faria o painel pedir para desistir de quem está
       -- conversando.
       tentativas_sem_resposta = case
         when exists (
           select 1
             from public.whatsapp_conversas c
             join public.whatsapp_mensagens m on m.conversa_id = c.id
            where c.lead_id = l.id
              and m.remetente = 'cliente'
              and (s.ultima is null or m.created_at > s.ultima)
         ) then 0
         else s.total
       end
  from somadas s
 where s.lead_id = l.id;
