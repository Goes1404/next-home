-- 0035 — Funil de qualificação e catálogo do corretor
--
-- Duas necessidades do atendimento que o schema ainda não cobria:
--
-- 1. RENDA MENSAL. O corretor pediu que a IA a pergunte ANTES de indicar
--    imóvel e antes de propor horário — é o dado que define o que dá para
--    financiar, e sem ele a visita pode ser marcada para quem não tem
--    perfil. `orcamento_min/max` não serve: orçamento é quanto a pessoa
--    quer gastar no imóvel, renda é quanto entra por mês. São perguntas
--    diferentes e as duas importam.
--
-- 2. CATÁLOGO DO CORRETOR. A corretora manda um PDF com as opções da casa
--    em vez de digitar uma lista no chat (está nas conversas exportadas).
--    Fica por corretor, não global: cada um trabalha com um recorte.

-- ---------------------------------------------------------------------------
-- 1. Renda mensal do lead
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists renda_mensal numeric(12, 2);

comment on column public.leads.renda_mensal is
  'Renda média mensal declarada pelo cliente. Diferente de orcamento_min/max, '
  'que é quanto ele pretende gastar no imóvel.';

-- A 0007 revogou update em `leads` e concede coluna a coluna. Sem este grant
-- a policy passa, o update afeta 0 linhas e ninguém percebe — já aconteceu.
grant update (renda_mensal) on public.leads to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Catálogo do corretor
-- ---------------------------------------------------------------------------
alter table public.corretores
  add column if not exists catalogo_url text,
  add column if not exists catalogo_nome text;

comment on column public.corretores.catalogo_url is
  'PDF de catálogo que a IA envia quando o cliente pede as opções da casa.';

grant update (catalogo_url, catalogo_nome) on public.corretores to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bucket do catálogo
-- ---------------------------------------------------------------------------
-- O bucket `empreendimentos` não serve: só aceita imagem e mp4, e o catálogo
-- é PDF — o upload falharia no mime type, com erro que parece de permissão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('corretores', 'corretores', true, 16777216, array['application/pdf'])
on conflict (id) do update
  set public = true,
      file_size_limit = 16777216,
      allowed_mime_types = array['application/pdf'];

-- Leitura pública: o arquivo vira link que o WhatsApp busca para entregar como
-- documento. Sem isso o provedor não consegue baixar e nada chega ao cliente.
drop policy if exists "catalogo corretor leitura publica" on storage.objects;
create policy "catalogo corretor leitura publica"
  on storage.objects for select
  using (bucket_id = 'corretores');

-- Escrita: cada corretor mexe SÓ no arquivo do próprio id. O caminho é
-- `catalogos/<corretor_id>-<timestamp>.pdf`, então a checagem é por prefixo.
-- Sem isso, qualquer autenticado trocaria o catálogo de qualquer colega.
drop policy if exists "catalogo corretor escreve o proprio" on storage.objects;
create policy "catalogo corretor escreve o proprio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'corretores'
    and name like 'catalogos/' || public.corretor_atual()::text || '-%'
  );

drop policy if exists "catalogo corretor atualiza o proprio" on storage.objects;
create policy "catalogo corretor atualiza o proprio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'corretores'
    and name like 'catalogos/' || public.corretor_atual()::text || '-%'
  );

drop policy if exists "catalogo corretor apaga o proprio" on storage.objects;
create policy "catalogo corretor apaga o proprio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'corretores'
    and name like 'catalogos/' || public.corretor_atual()::text || '-%'
  );
