-- Storage do material de empreendimento: a permissão que faltava desde sempre.
--
-- DESCOBERTO em 24/08/2026, ao construir a importação em massa: a única
-- policy de `storage.objects` para `authenticated` cobria
-- `empreendimentos/corretores/<id>/…` (a pasta pessoal do corretor, criada
-- na 0015). O `uploadFotoOuPlanta` do painel escreve em outra pasta — logo,
-- **nenhum upload de foto pelo painel jamais funcionou**. O erro voltava
-- como "Falha ao enviar arquivo. Verifique sua conexão", culpando a internet
-- do corretor por um problema de permissão. Confere com o banco: as 286
-- mídias de produção vieram todas de seed e backfill, nenhuma de upload.
--
-- A regra aqui ESPELHA a da tabela `midias`: qualquer pessoa cadastrada em
-- `corretores` gerencia o material de qualquer empreendimento. Não é
-- descuido — é a mesma decisão já tomada em "Corretores autenticados podem
-- gerenciar midias", e o catálogo é da imobiliária, não de um corretor. O
-- que a policy impede é escrever em pasta que não corresponde a
-- empreendimento nenhum, ou seja, usar o bucket como depósito solto.

create policy "corretor gerencia midia de empreendimento"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'empreendimentos'
    and exists (select 1 from public.corretores c where c.user_id = auth.uid())
    and exists (
      select 1 from public.empreendimentos e
       where e.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'empreendimentos'
    and exists (select 1 from public.corretores c where c.user_id = auth.uid())
    and exists (
      select 1 from public.empreendimentos e
       where e.id::text = (storage.foldername(name))[1]
    )
  );

-- A apresentação da construtora fica guardada no bucket enquanto o corretor
-- escolhe o que aproveitar dela — e o bucket recusava `application/pdf`.
-- Guardar UM pdf é mais barato que guardar as sessenta imagens extraídas
-- dele, e a extração é determinística: o índice de cada imagem continua
-- valendo na hora de gravar.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
 where id = 'empreendimentos';
