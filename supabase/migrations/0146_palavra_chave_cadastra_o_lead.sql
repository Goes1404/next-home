-- 0146: a palavra-chave do corretor cadastra o lead (plano de ativação da IA,
-- Fase 1, 03/10/2026).
--
-- Até aqui, a palavra-chave só liberava conversa de quem JÁ era lead: num
-- número novo, o porteiro da 0111 descartava a mensagem antes de o webhook
-- ler a palavra. Agora a mensagem do corretor com a palavra cadastra o
-- contato na carteira dele. Duas coisas novas no banco:

-- 1. O resultado da importação do histórico do chat, para a conversa avisar o
--    corretor quando não foi possível trazer as mensagens anteriores.
--    Nulo = conversa que não nasceu pela palavra-chave (nada a dizer).
alter table public.whatsapp_conversas
  add column if not exists historico_anterior text
    check (historico_anterior in ('importado', 'indisponivel'));

comment on column public.whatsapp_conversas.historico_anterior is
  'Desfecho da importação do histórico quando a conversa nasceu pela palavra-chave do corretor (0146): importado ou indisponivel.';

-- 2. Palavra-chave usada num número que já é lead de OUTRO corretor (regra N6).
--    O lead não muda de carteira, a IA não responde no número de quem
--    acionou, e o aviso vai só para ele, sem o nome do dono. Esta tabela é o
--    registro para a gestão consultar e a fonte do aviso na fila do Início.
create table if not exists public.ativacoes_em_lead_alheio (
  id uuid primary key default gen_random_uuid(),
  -- Quem digitou a palavra-chave.
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  -- O lead do outro corretor. O id não revela o dono a quem acionou: a RLS
  -- de leads continua escondendo a linha dele.
  lead_id uuid references public.leads(id) on delete set null,
  telefone text not null,
  created_at timestamptz not null default now()
);

create index if not exists ativacoes_em_lead_alheio_corretor_idx
  on public.ativacoes_em_lead_alheio (corretor_id, created_at desc);
create index if not exists ativacoes_em_lead_alheio_lead_idx
  on public.ativacoes_em_lead_alheio (lead_id);

alter table public.ativacoes_em_lead_alheio enable row level security;

-- Só o servidor escreve (chave de serviço, no webhook). O corretor lê as
-- próprias tentativas; o ADM lê todas.
revoke all on public.ativacoes_em_lead_alheio from anon;
revoke all on public.ativacoes_em_lead_alheio from authenticated;
grant select on public.ativacoes_em_lead_alheio to authenticated;

drop policy if exists "corretor le as proprias, adm le todas" on public.ativacoes_em_lead_alheio;
create policy "corretor le as proprias, adm le todas"
  on public.ativacoes_em_lead_alheio
  for select
  to authenticated
  using ((select public.eh_gestor()) or corretor_id = (select public.corretor_atual()));
