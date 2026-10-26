-- 0221: a fila dos avisos nos grupos (`lead_envios_grupo`, 0215) ganha o
-- bloco de isolamento que toda tabela com grupo tem (27/10/2026).
--
-- A 0215 nasceu com RLS e sem grant, mas sem o carimbo do grupo nem a policy
-- restritiva: a suíte de isolamento do CI ficou vermelha desde então. Só a
-- chave de serviço escreve nela, e toda escrita do código já filtra o grupo;
-- isto fecha a porta no banco: o grupo da linha sai do lead e do corretor, e
-- uma linha nunca aponta para lead ou corretor de outra imobiliária.
--
-- Aditiva: o código não muda.

begin;

set local lock_timeout = '5s';

drop policy if exists isolamento_por_grupo on public.lead_envios_grupo;
create policy isolamento_por_grupo on public.lead_envios_grupo as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists lead_envios_grupo_00_grupo on public.lead_envios_grupo;
create trigger lead_envios_grupo_00_grupo
  before insert or update of grupo_id, lead_id, corretor_id on public.lead_envios_grupo
  for each row execute function public.carimbar_grupo(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id'
  );

drop trigger if exists lead_envios_grupo_zz_grupo_update on public.lead_envios_grupo;
create trigger lead_envios_grupo_zz_grupo_update
  after update on public.lead_envios_grupo for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.lead_id is distinct from old.lead_id
    or new.corretor_id is distinct from old.corretor_id
  )
  execute function public.conferir_grupo_final(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id'
  );

drop trigger if exists lead_envios_grupo_zz_grupo_insert on public.lead_envios_grupo;
create trigger lead_envios_grupo_zz_grupo_insert
  after insert on public.lead_envios_grupo for each row
  execute function public.conferir_grupo_final(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id'
  );

commit;
