-- Apaga o perfil de DEMONSTRAÇÃO (scripts/demo/semearPerfilDemo.sql).
-- Rodar no editor SQL do Supabase. Irreversível, e só toca no que é do
-- corretor 'demo-lucas-andrade'.

do $$
declare
  demo uuid := (select id from public.corretores where slug = 'demo-lucas-andrade');
  usuario uuid := (select user_id from public.corretores where slug = 'demo-lucas-andrade');
begin
  if demo is null then
    raise notice 'Perfil de demonstração não encontrado.';
    return;
  end if;
  delete from public.venda_participantes where venda_id in (select id from public.vendas where corretor_id = demo);
  delete from public.vendas where corretor_id = demo;
  delete from public.ia_interacoes where corretor_id = demo;
  delete from public.leads where corretor_id = demo;  -- leva conversas, mensagens, tarefas, dossiê e linha do tempo
  delete from public.metas_corretor where corretor_id = demo;
  delete from public.corretor_disponibilidade where corretor_id = demo;
  delete from public.corretores where id = demo;

  -- Colegas de demonstração do ranking (slug demo-*, sem login).
  delete from public.venda_participantes where venda_id in (
    select v.id from public.vendas v join public.corretores c on c.id = v.corretor_id where c.slug like 'demo-%');
  delete from public.vendas where corretor_id in (select id from public.corretores where slug like 'demo-%');
  delete from public.corretores where slug like 'demo-%' and user_id is null;
  if usuario is not null then
    delete from auth.users where id = usuario;  -- leva identities e sessões
  end if;
end $$;
