-- 0236 · mais notificações no celular do corretor (29/10/2026)
--
-- Pedido do dono: além do "lead novo" (0203), o app avisa no celular:
--
-- 1. Lembrete de visita 1h antes. `visitas.lembrete_1h_para` guarda o
--    `inicio` para o qual o lembrete saiu (e não só "quando saiu"): visita
--    remarcada é a MESMA linha com `inicio` novo (0224), e precisa de
--    lembrete novo. O claim compara o valor lido com o atual no próprio
--    UPDATE: dois tiques ao mesmo tempo não lembram duas vezes.
-- 2. Cliente respondeu no WhatsApp numa conversa que está com o corretor
--    (IA desligada, expediente, cota). `leads.aviso_cliente_respondeu_em` é
--    a carência por lead: uma rajada de dez mensagens vira UMA notificação
--    a cada 15 min, não dez vibrações.
-- 3. Lead parado sem contato há 48h. `leads.aviso_parado_em` é o claim de
--    "uma vez por lead por dia"; a busca é a função
--    `leads_parados_para_aviso`, porque "último contato" junta duas tabelas
--    (mensagens nossas no WhatsApp e interações registradas na ficha) e
--    isso não cabe num filtro do PostgREST.
-- 4. Senha vai vencer (validade de 90 dias). `corretores.aviso_senha_em` é
--    o claim de "uma vez por dia" e, depois de vencida, de "uma vez só".
--
-- Tudo roda no tique dos follow-ups (`/api/cron/followups`, pg_cron a cada
-- 5 min): nenhum cron novo.
--
-- Só aditivo; as colunas novas são escritas só pela chave de serviço (não
-- entram em grant de update de ninguém). O código tolera a migration ainda
-- não aplicada: sem as colunas/função, as quatro regras não enviam nada
-- (falham fechadas, com aviso no log) e o resto do tique segue.
--
-- Número 0236: a 0235 é o login por usuário (já na branch principal) e a
-- 0237+ fica para a frente das permissões do administrador. Esta não
-- depende de nenhuma delas; se colidir na junção, basta renumerar.
-- Aplicar ANTES do deploy (sem ela, as quatro regras só não enviam).
--
-- Reversão:
--   drop function if exists public.leads_parados_para_aviso(timestamptz, timestamptz, timestamptz, int);
--   alter table public.visitas drop column if exists lembrete_1h_para;
--   alter table public.leads drop column if exists aviso_cliente_respondeu_em,
--     drop column if exists aviso_parado_em;
--   alter table public.corretores drop column if exists aviso_senha_em;

begin;
set local lock_timeout = '5s';

alter table public.visitas
  add column if not exists lembrete_1h_para timestamptz;

comment on column public.visitas.lembrete_1h_para is
  'O `inicio` para o qual o lembrete de 1h antes já saiu no celular. Remarcou, o valor deixa de bater e sai lembrete novo (0236).';

alter table public.leads
  add column if not exists aviso_cliente_respondeu_em timestamptz,
  add column if not exists aviso_parado_em timestamptz;

comment on column public.leads.aviso_cliente_respondeu_em is
  'Última notificação "cliente respondeu" ao corretor dono (carência de 15 min, claim antes do envio, 0236).';
comment on column public.leads.aviso_parado_em is
  'Última notificação "lead parado sem contato" (no máximo uma por dia de São Paulo, claim antes do envio, 0236).';

alter table public.corretores
  add column if not exists aviso_senha_em timestamptz;

comment on column public.corretores.aviso_senha_em is
  'Última notificação "sua senha vai vencer / venceu" (uma por dia; vencida, uma só, 0236).';

-- ---------------------------------------------------------------------------
-- Leads parados: sem contato NOSSO entre `p_janela_desde` e `p_parado_desde`.
--
-- Contato nosso = mensagem da IA ou do corretor em qualquer conversa do lead,
-- ou interação registrada na ficha (mensagem, ligação, visita). Lead sem
-- nenhum contato conta da criação. Fica de fora: arquivado, quem pediu para
-- não ser contatado, fechado/perdido, quem tem visita marcada no futuro e
-- dono inativo. O mais antigo sem aviso vem primeiro: com teto por corretor
-- no código, os mesmos três leads não ocupam o aviso todo dia.
-- ---------------------------------------------------------------------------
create or replace function public.leads_parados_para_aviso(
  p_parado_desde timestamptz,
  p_janela_desde timestamptz,
  p_dia_inicio timestamptz,
  p_limite int default 100
)
returns table (
  id uuid,
  nome text,
  telefone text,
  corretor_id uuid,
  grupo_id uuid,
  ultimo_contato timestamptz,
  aviso_parado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with candidatos as (
    select
      l.id, l.nome, l.telefone, l.corretor_id, l.grupo_id, l.aviso_parado_em,
      greatest(
        l.created_at,
        (select max(m.created_at)
           from public.whatsapp_mensagens m
           join public.whatsapp_conversas c on c.id = m.conversa_id
          where c.lead_id = l.id and m.remetente in ('bot', 'corretor')),
        (select max(i.created_at)
           from public.lead_interacoes i
          where i.lead_id = l.id and i.tipo in ('mensagem', 'ligacao', 'visita'))
      ) as ultimo_contato
    from public.leads l
    join public.corretores co on co.id = l.corretor_id and co.ativo and co.grupo_id = l.grupo_id
    where l.arquivado_em is null
      and l.nao_contatar_em is null
      and l.etapa not in ('fechado', 'perdido')
      and (l.visita_agendada_em is null or l.visita_agendada_em < now())
      and l.created_at < p_parado_desde
      and (l.aviso_parado_em is null or l.aviso_parado_em < p_dia_inicio)
  )
  select c.id, c.nome, c.telefone, c.corretor_id, c.grupo_id, c.ultimo_contato, c.aviso_parado_em
    from candidatos c
   where c.ultimo_contato < p_parado_desde
     and c.ultimo_contato >= p_janela_desde
   order by c.aviso_parado_em asc nulls first, c.ultimo_contato asc
   limit greatest(1, least(p_limite, 500));
$$;

comment on function public.leads_parados_para_aviso(timestamptz, timestamptz, timestamptz, int) is
  'Leads sem contato nosso (WhatsApp da IA/corretor ou interação da ficha) na janela dada, ainda não avisados hoje (0236). Só a chave de serviço chama.';

revoke all on function public.leads_parados_para_aviso(timestamptz, timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.leads_parados_para_aviso(timestamptz, timestamptz, timestamptz, int) to service_role;

commit;
