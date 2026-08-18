-- Templates de mensagem por corretor e histórico de disparo em massa.
--
-- `wa.me` nunca envia sozinho -- quem manda a mensagem de fato é sempre um
-- clique humano dentro do WhatsApp Web/app. `historico_envios` registra
-- "esta aba foi aberta com este texto", não "esta mensagem foi entregue" --
-- é tudo que dá pra confirmar sem a API oficial do WhatsApp Business.

create table templates_mensagens (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references corretores(id) on delete cascade,
  titulo text not null,
  -- Variáveis: {{nome_lead}}, {{nome_corretor}}, {{telefone_corretor}}.
  conteudo text not null,
  padrao boolean not null default false,
  created_at timestamptz not null default now()
);

create table historico_envios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  corretor_id uuid not null references corretores(id) on delete cascade,
  -- Texto já com as variáveis substituídas -- o que de fato foi aberto no
  -- WhatsApp daquele lead, não o template genérico.
  mensagem_enviada text not null,
  -- Só existe 'aberto' por enquanto. Texto livre, não enum, pra não
  -- precisar de migration quando a API oficial trouxer status de verdade.
  status_envio text not null default 'aberto',
  created_at timestamptz not null default now()
);

alter table templates_mensagens enable row level security;
alter table historico_envios enable row level security;

create policy "corretor gerencia os proprios templates"
  on templates_mensagens for all
  to authenticated
  using (corretor_id = corretor_atual())
  with check (corretor_id = corretor_atual());

grant select, insert, update, delete on templates_mensagens to authenticated;

create policy "corretor grava seu envio"
  on historico_envios for insert
  to authenticated
  with check (corretor_id = corretor_atual());

create policy "corretor le os seus, gestor le todos historico"
  on historico_envios for select
  to authenticated
  using (eh_gestor() or corretor_id = corretor_atual());

grant select, insert on historico_envios to authenticated;
