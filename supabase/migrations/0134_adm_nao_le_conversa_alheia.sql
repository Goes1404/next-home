-- 0134 — O ADM não lê a conversa de outro corretor (30/09/2026).
--
-- Decisão de produto: o ADM (papel `gestor`) tem todas as funcionalidades,
-- mas NÃO lê as mensagens de WhatsApp dos corretores. O número pareado
-- costuma ser o WhatsApp pessoal de cada um, e a 0031 tinha aberto
-- conversa, mensagem e telemetria da IA para o gestor inteiro — foi por
-- isso que a promoção do Eduardo foi desfeita em 12/09.
--
-- O que continua com o ADM: leads, funil, visitas, anotações, a leitura da
-- IA sobre o lead (`lead_observacoes_ia`: resumo e temperatura), vendas e
-- as campanhas da equipe. Os painéis que precisam de CONTAGEM de conversa
-- passam a contar pela chave de serviço, depois de conferir o papel
-- (`lib/admin/numerosDaEquipe.ts`), e só pedem id, data e contagem.
--
-- Quatro mudanças:
--   1. conversas, mensagens, telemetria (`ia_interacoes`) e correções
--      (`ia_correcoes`, que guardam a fala do cliente) ficam só com o dono;
--   2. o número de WhatsApp de outro corretor sai do alcance do ADM pela
--      API (a tela lê status pela chave de serviço, e desconectar é uma
--      ação do servidor com registro em `admin_eventos`);
--   3. excluir lead passa a ser só do ADM (o corretor arquiva);
--   4. `admin_eventos` ganha a ação `numero_desconectado`.
--
-- As views (`pessoas_do_corretor`, métricas) já são `security_invoker`
-- (0077): elas passam a recortar sozinhas, e o lead de outro corretor
-- aparece para o ADM como lead, sem prévia de mensagem.

-- 1a. whatsapp_conversas — havia TRÊS policies em produção, duas com o
-- gestor dentro (uma lendo `papel = 'gestor'` direto, sem `eh_gestor()`).
-- Só a primeira está nas migrations; as outras duas foram criadas fora
-- delas e saem aqui também.
drop policy if exists "Corretores gerenciam suas conversas" on public.whatsapp_conversas;
drop policy if exists "Corretores leem suas proprias conversas" on public.whatsapp_conversas;
drop policy if exists "Corretores alteram suas proprias conversas" on public.whatsapp_conversas;

create policy "whatsapp_conversas: so o dono"
  on public.whatsapp_conversas
  for all
  to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (corretor_id = (select public.corretor_atual()));

-- 1b. whatsapp_mensagens
drop policy if exists "Corretores leem mensagens de suas conversas" on public.whatsapp_mensagens;

create policy "whatsapp_mensagens: so o dono da conversa"
  on public.whatsapp_mensagens
  for all
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas cv
      where cv.id = whatsapp_mensagens.conversa_id
        and cv.corretor_id = (select public.corretor_atual())
    )
  );

-- 1c. ia_interacoes — a telemetria traz o `contexto` da resposta (dossiê,
-- jogada, janela de histórico): é conversa por outro nome.
drop policy if exists "ia_interacoes_leitura" on public.ia_interacoes;
drop policy if exists "ia_interacoes_avaliacao" on public.ia_interacoes;

create policy "ia_interacoes: dono le"
  on public.ia_interacoes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas c
      where c.id = ia_interacoes.conversa_id
        and c.corretor_id = (select public.corretor_atual())
    )
  );

-- O grant de UPDATE continua só em `avaliacao` e `motivo_avaliacao` (0131).
create policy "ia_interacoes: dono avalia"
  on public.ia_interacoes
  for update
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas c
      where c.id = ia_interacoes.conversa_id
        and c.corretor_id = (select public.corretor_atual())
    )
  )
  with check (true);

-- 1d. ia_correcoes — guarda `fala_cliente` e `resposta_ia`.
drop policy if exists "ia_correcoes: dono ou gestor leem" on public.ia_correcoes;

create policy "ia_correcoes: dono le"
  on public.ia_correcoes
  for select
  to authenticated
  using (corretor_id = (select public.corretor_atual()));

-- 2. corretor_whatsapp_instancias — a versão com o gestor dava ALL: pela
-- API ele desconectava o número de outro e reescrevia o tom da IA dele.
-- Em produção havia também uma policy só do dono ("...propria instancia",
-- sem acento) criada fora das migrations. As duas saem e fica UMA, escrita
-- aqui, para o repositório descrever o banco.
drop policy if exists "Corretores gerenciam sua própria instância" on public.corretor_whatsapp_instancias;
drop policy if exists "Corretores gerenciam sua propria instancia" on public.corretor_whatsapp_instancias;

create policy "corretor_whatsapp_instancias: so o dono"
  on public.corretor_whatsapp_instancias
  for all
  to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (corretor_id = (select public.corretor_atual()));

-- 3. leads — excluir é do ADM. Continua valendo que só o lead arquivado é
-- alcançado (a trava mora na query das actions).
drop policy if exists "corretor exclui os seus, gestor exclui todos" on public.leads;

create policy "leads: so o adm exclui"
  on public.leads
  for delete
  to authenticated
  using ((select public.eh_gestor()));

-- 4. admin_eventos
alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (
  acao = any (array[
    'conta_criada',
    'senha_redefinida',
    'papel_alterado',
    'corretor_desativado',
    'corretor_reativado',
    'leads_redistribuidos',
    'numero_desconectado'
  ])
);
