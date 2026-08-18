-- Personalização do link pessoal: fundo em vídeo ou foto, e destaques do
-- catálogo escolhidos pelo próprio corretor.

alter table corretores
  add column fundo_tipo text not null default 'video'
    check (fundo_tipo in ('video', 'foto')),
  add column fundo_foto_url text;

-- video_url existe desde a 0010 mas nunca foi liberado por GRANT — até
-- agora só um script direto no banco conseguia setá-lo.
grant update (video_url, fundo_tipo, fundo_foto_url) on corretores to authenticated;

create table corretor_destaques (
  corretor_id uuid not null references corretores(id) on delete cascade,
  empreendimento_slug text not null references empreendimentos(slug) on delete cascade,
  posicao smallint not null,
  primary key (corretor_id, empreendimento_slug)
);

alter table corretor_destaques enable row level security;

-- Leitura pública: a ordem personalizada aparece pra QUALQUER visitante que
-- chegou pelo link do corretor, não só pra ele logado — a consulta que
-- monta a home/portfólio roda com o cliente anônimo.
create policy "destaques sao publicos"
  on corretor_destaques for select
  to anon, authenticated
  using (true);

create policy "corretor gerencia os proprios destaques"
  on corretor_destaques for all
  to authenticated
  using (corretor_id = corretor_atual())
  with check (corretor_id = corretor_atual());

grant select, insert, update, delete on corretor_destaques to authenticated;
grant select on corretor_destaques to anon;

-- Storage: corretor só escreve dentro da própria pasta no bucket público
-- já existente (empreendimentos), usado hoje pros vídeos de fundo.
create policy "corretor gerencia a propria pasta de midia"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = corretor_atual()::text
  )
  with check (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = corretor_atual()::text
  );
