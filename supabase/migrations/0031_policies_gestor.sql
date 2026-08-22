-- 0031 — As policies passam a conhecer o gestor
--
-- Duas dívidas que só apareceram quando a administração virou tela de verdade:
--
-- 1. As policies de `historico_precos_*` (0017) SE CHAMAM "Gestores podem…"
--    mas o predicado é só "existe algum corretor logado". O nome prometia uma
--    regra que o banco não aplicava.
-- 2. As policies de `whatsapp_*` (0018) e `ia_interacoes` (0029) amarram tudo
--    ao dono, sem exceção para o gestor — enquanto comentários no código
--    prometiam que "o gestor vê as da imobiliária". Sem isso, a aba de
--    WhatsApp da administração seria uma tela vazia.
--
-- O formato `(eh_gestor() or <predicado antigo>)` é o mesmo que
-- `lead_observacoes_ia` (0018:183) já usava — nada de padrão novo.

-- ---------------------------------------------------------------------------
-- Histórico de preços: "Gestores podem" passa a valer
-- ---------------------------------------------------------------------------
-- Nota honesta de escopo: o catálogo segue editável por qualquer corretor
-- logado (policies da 0019, decisão de produto). O que esta migration garante
-- é que o REAJUSTE EM MASSA com histórico e rollback seja ato de gestor — a
-- ferramenta que muda o preço de tudo de uma vez.
drop policy if exists "Gestores podem criar lotes de preços" on public.historico_precos_lotes;
create policy "Gestores podem criar lotes de preços"
  on public.historico_precos_lotes
  for insert to authenticated
  with check (public.eh_gestor());

drop policy if exists "Gestores podem atualizar status do lote" on public.historico_precos_lotes;
create policy "Gestores podem atualizar status do lote"
  on public.historico_precos_lotes
  for update to authenticated
  using (public.eh_gestor())
  with check (public.eh_gestor());

drop policy if exists "Gestores podem inserir itens no lote" on public.historico_precos_itens;
create policy "Gestores podem inserir itens no lote"
  on public.historico_precos_itens
  for insert to authenticated
  with check (public.eh_gestor());

-- ---------------------------------------------------------------------------
-- WhatsApp: o gestor enxerga a operação da equipe
-- ---------------------------------------------------------------------------
drop policy if exists "Corretores gerenciam sua própria instância" on public.corretor_whatsapp_instancias;
create policy "Corretores gerenciam sua própria instância"
  on public.corretor_whatsapp_instancias
  for all to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.id = corretor_whatsapp_instancias.corretor_id
    )
  );

drop policy if exists "Corretores gerenciam suas conversas" on public.whatsapp_conversas;
create policy "Corretores gerenciam suas conversas"
  on public.whatsapp_conversas
  for all to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.id = whatsapp_conversas.corretor_id
    )
  );

drop policy if exists "Corretores leem mensagens de suas conversas" on public.whatsapp_mensagens;
create policy "Corretores leem mensagens de suas conversas"
  on public.whatsapp_mensagens
  for all to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.whatsapp_conversas cv
      join public.corretores c on c.id = cv.corretor_id
      where cv.id = whatsapp_mensagens.conversa_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Corretores gerenciam suas campanhas" on public.whatsapp_campanhas;
create policy "Corretores gerenciam suas campanhas"
  on public.whatsapp_campanhas
  for all to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.id = whatsapp_campanhas.corretor_id
    )
  );

drop policy if exists "Corretores gerenciam filas de suas campanhas" on public.whatsapp_campanhas_fila;
create policy "Corretores gerenciam filas de suas campanhas"
  on public.whatsapp_campanhas_fila
  for all to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.whatsapp_campanhas cmp
      join public.corretores c on c.id = cmp.corretor_id
      where cmp.id = whatsapp_campanhas_fila.campanha_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Telemetria da IA: o gestor precisa ver a qualidade do time inteiro
-- ---------------------------------------------------------------------------
drop policy if exists ia_interacoes_leitura on public.ia_interacoes;
create policy ia_interacoes_leitura on public.ia_interacoes
  for select to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.whatsapp_conversas c
      join public.corretores co on co.id = c.corretor_id
      where c.id = ia_interacoes.conversa_id and co.user_id = auth.uid()
    )
  );

drop policy if exists ia_interacoes_avaliacao on public.ia_interacoes;
create policy ia_interacoes_avaliacao on public.ia_interacoes
  for update to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.whatsapp_conversas c
      join public.corretores co on co.id = c.corretor_id
      where c.id = ia_interacoes.conversa_id and co.user_id = auth.uid()
    )
  )
  with check (true);
