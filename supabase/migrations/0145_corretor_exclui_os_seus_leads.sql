-- 0145: o corretor volta a excluir os PRÓPRIOS leads (pedido de 02/10/2026,
-- para o Eduardo). O ADM continua excluindo os de qualquer um. Exclusão leva
-- por cascade a conversa de WhatsApp, o dossiê, tarefas e linha do tempo.
drop policy if exists "leads: so o adm exclui" on public.leads;
drop policy if exists "corretor exclui os seus, gestor exclui todos" on public.leads;

create policy "corretor exclui os seus, gestor exclui todos"
  on public.leads
  for delete
  to authenticated
  using ((select public.eh_gestor()) or corretor_id = (select public.corretor_atual()));
