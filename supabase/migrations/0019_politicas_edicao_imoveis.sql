-- Migration 0019: Políticas de Edição de Imóveis para Corretores e Gestão
-- Permite que corretores autenticados atualizem fotos, textos, preços, tipologias e características dos empreendimentos

-- Políticas para Empreendimentos
create policy "Corretores autenticados podem atualizar empreendimentos"
  on public.empreendimentos
  for update
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );

create policy "Corretores autenticados podem inserir empreendimentos"
  on public.empreendimentos
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );

-- Políticas para Mídias (Fotos, Plantas, Vídeos)
create policy "Corretores autenticados podem gerenciar midias"
  on public.midias
  for all
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );

-- Políticas para Tipologias
create policy "Corretores autenticados podem gerenciar tipologias"
  on public.tipologias
  for all
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );

-- Políticas para Empreendimento Lazer
create policy "Corretores autenticados podem gerenciar lazer do empreendimento"
  on public.empreendimento_lazer
  for all
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );
