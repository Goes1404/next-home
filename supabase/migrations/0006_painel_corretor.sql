-- Painel do corretor: ler os próprios leads e editar o próprio cadastro.
--
-- Até aqui `leads` só tinha policy de INSERT (0001_init.sql): o site gravava
-- os contatos e ninguém conseguia lê-los pela aplicação — só abrindo o painel
-- do Supabase. Um funil cego. É isso que a policy de select abaixo resolve.

alter table corretores add column bio text;

-- Os leads são sempre lidos filtrados por corretor e ordenados por data.
create index leads_corretor_idx on leads (corretor_id, created_at desc);

-- Cada corretor lê apenas os leads atribuídos a ele. Leads sem corretor
-- (tráfego orgânico, sem link pessoal) continuam invisíveis na aplicação até
-- existir um painel de administração ou uma regra de distribuição.
create policy "corretor le os proprios leads"
  on leads for select
  to authenticated
  using (corretor_id in (select id from corretores where user_id = auth.uid()));

-- E edita apenas a própria linha.
create policy "corretor edita o proprio cadastro"
  on corretores for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RLS decide QUAIS LINHAS, não quais colunas. Sem os grants abaixo, a policy
-- acima permitiria ao corretor alterar qualquer campo da própria linha —
-- inclusive `creci` (dado regulatório), `slug` (quebraria todos os links
-- pessoais já compartilhados) e `user_id` (poderia se desvincular da conta ou
-- apontar para outra). Restrição por coluna é competência de GRANT.
revoke update on corretores from authenticated;
grant update (nome, whatsapp, foto_url, bio) on corretores to authenticated;
