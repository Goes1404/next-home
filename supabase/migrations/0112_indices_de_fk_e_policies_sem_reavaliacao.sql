-- 0112 — Índices nas chaves estrangeiras e policies sem reavaliação por linha
--
-- F2 do roadmap de performance (docs/ROADMAP-PERFORMANCE.md), a metade que
-- mora no banco. Os advisors de performance do Supabase, em 13/09/2026,
-- listavam:
--
--   • 23 chaves estrangeiras sem índice de cobertura — entre elas
--     `tipologias.empreendimento_id` e `empreendimentos.corretor_id`, que
--     TODA leitura do catálogo atravessa (o embed de `tipologias(*)` e o de
--     `corretor:corretores!empreendimentos_corretor_id_fkey`), e
--     `leads.empreendimento_id`, `lead_tarefas.lead_id`,
--     `whatsapp_campanhas_fila.lead_id`, que o painel filtra o dia inteiro.
--   • 27 policies chamando `auth.uid()` DIRETO no `using`/`with check`. O
--     Postgres reavalia a função para cada linha candidata; embrulhada em
--     `(select auth.uid())` ela vira um initplan, avaliado uma vez por
--     consulta. Em tabela de 8 mil linhas (whatsapp_mensagens) é a diferença
--     entre 8 mil chamadas e uma.
--   • 1 par de índices idênticos em `whatsapp_campanhas_fila`.
--
-- Nada aqui muda O QUE uma policy permite — só COMO o Postgres a avalia. A
-- forma (`using`/`with check`) é copiada da própria `pg_policies` dentro de
-- um bloco `do`, com a única troca `auth.uid()` → `(select auth.uid())`:
-- transcrever 27 expressões à mão é o jeito mais curto de afrouxar uma
-- por engano. A régua da 0077 vale: conferir nos DOIS sentidos depois —
-- `get_advisors(performance)` sem `auth_rls_initplan`, e o corretor
-- continuando a ver as próprias linhas.

-- ───────────────────────── Índices de FK ─────────────────────────

create index if not exists admin_eventos_alvo_corretor_id_idx on public.admin_eventos (alvo_corretor_id);
create index if not exists admin_eventos_ator_id_idx on public.admin_eventos (ator_id);
create index if not exists catalogo_candidatos_empreendimento_id_idx on public.catalogo_candidatos (empreendimento_id);
create index if not exists cliques_whatsapp_empreendimento_id_idx on public.cliques_whatsapp (empreendimento_id);
create index if not exists corretor_destaques_empreendimento_slug_idx on public.corretor_destaques (empreendimento_slug);
create index if not exists empreendimento_lazer_lazer_item_id_idx on public.empreendimento_lazer (lazer_item_id);
create index if not exists empreendimentos_corretor_id_idx on public.empreendimentos (corretor_id);
create index if not exists estudio_mensagens_imagem_id_idx on public.estudio_mensagens (imagem_id);
create index if not exists estudio_mensagens_video_job_id_idx on public.estudio_mensagens (video_job_id);
create index if not exists historico_envios_corretor_id_idx on public.historico_envios (corretor_id);
create index if not exists historico_envios_lead_id_idx on public.historico_envios (lead_id);
create index if not exists historico_precos_lotes_gestor_id_idx on public.historico_precos_lotes (gestor_id);
create index if not exists inbound_logs_lead_id_idx on public.inbound_logs (lead_id);
create index if not exists lead_interacoes_corretor_id_idx on public.lead_interacoes (corretor_id);
create index if not exists lead_tarefas_lead_id_idx on public.lead_tarefas (lead_id);
create index if not exists leads_empreendimento_id_idx on public.leads (empreendimento_id);
create index if not exists parametros_credito_conferido_por_idx on public.parametros_credito (conferido_por);
create index if not exists templates_mensagens_corretor_id_idx on public.templates_mensagens (corretor_id);
create index if not exists tipologias_empreendimento_id_idx on public.tipologias (empreendimento_id);
create index if not exists video_jobs_empreendimento_id_idx on public.video_jobs (empreendimento_id);
create index if not exists whatsapp_campanhas_empreendimento_id_idx on public.whatsapp_campanhas (empreendimento_id);
create index if not exists whatsapp_campanhas_fila_lead_id_idx on public.whatsapp_campanhas_fila (lead_id);
create index if not exists whatsapp_followups_instancia_id_idx on public.whatsapp_followups (instancia_id);

-- Par idêntico: `idx_whatsapp_fila_status_agenda` fica, o outro sai.
drop index if exists public.idx_whatsapp_fila_status_agendado;

-- ───────────────────────── Policies: initplan ─────────────────────────

do $$
declare
  p record;
  usando text;
  checando text;
  comando text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    usando := replace(p.qual, 'auth.uid()', '(select auth.uid())');
    checando := replace(p.with_check, 'auth.uid()', '(select auth.uid())');
    comando := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if usando is not null then
      comando := comando || format(' using (%s)', usando);
    end if;
    if checando is not null then
      comando := comando || format(' with check (%s)', checando);
    end if;
    execute comando;
  end loop;
end
$$;
