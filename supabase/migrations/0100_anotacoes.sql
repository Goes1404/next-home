-- 0100 — Anotações do corretor: bloco de notas com lembretes (06/09/2026).
--
-- Spec: docs/superpowers/specs/2026-09-06-anotacoes-do-corretor-design.md
--
-- ## O desenho em três decisões
--
-- 1. `destinatario_id` com default no INSERT da aplicação (= autor) é o que
--    faz "nota para colega" existir sem segunda tabela: a fila do Início e o
--    lembrete de WhatsApp olham o DESTINATÁRIO; a autoria fica preservada
--    para a tela dizer "de Matheus".
-- 2. O empreendimento NÃO é coluna daqui: vem do lead vinculado
--    (`empreendimento_id`/`imovel_interesse_id` que `leads` já tem). Copiar
--    criaria duas verdades para divergir — a lição do historico_envios.
-- 3. `lembrete_enviado_em` controla SÓ o WhatsApp (claim atômico no runner);
--    o que tira o lembrete do painel é `concluida_em`, gesto do destinatário.
--    Sem instância conectada o runner carimba `lembrete_erro` e não insiste.

create table public.anotacoes (
  id                  uuid primary key default gen_random_uuid(),
  -- Autor. Cascade: corretor removido leva as notas dele junto.
  corretor_id         uuid not null references public.corretores(id) on delete cascade,
  -- Quem recebe (e conclui). A aplicação grava o autor quando não há colega.
  destinatario_id     uuid not null references public.corretores(id) on delete cascade,
  -- Vínculo opcional; lead excluído não derruba a nota (set null).
  lead_id             uuid references public.leads(id) on delete set null,
  texto               text not null,
  lembrete_em         timestamptz,
  lembrete_whatsapp   boolean not null default true,
  lembrete_enviado_em timestamptz,
  lembrete_erro       text,
  concluida_em        timestamptz,
  created_at          timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- A fila do Início e o runner consultam por destinatário + vencimento.
create index anotacoes_destinatario_lembrete_idx
  on public.anotacoes (destinatario_id, lembrete_em)
  where concluida_em is null;
create index anotacoes_autor_idx on public.anotacoes (corretor_id, created_at desc);
create index anotacoes_lead_idx on public.anotacoes (lead_id);
-- O runner varre o mundo inteiro (service key): vencidos ainda não enviados.
create index anotacoes_lembrete_pendente_idx
  on public.anotacoes (lembrete_em)
  where lembrete_enviado_em is null and concluida_em is null and lembrete_em is not null;

alter table public.anotacoes enable row level security;

-- Autor OU destinatário leem; gestor lê tudo (mesma forma das policies 0031).
create policy "anotacoes: autor ou destinatario leem"
  on public.anotacoes for select to authenticated
  using (
    corretor_id = public.corretor_atual()
    or destinatario_id = public.corretor_atual()
    or public.eh_gestor()
  );

-- Só se escreve como AUTOR — forjar autoria de colega não pode.
create policy "anotacoes: autor cria"
  on public.anotacoes for insert to authenticated
  with check (corretor_id = public.corretor_atual());

-- O destinatário precisa CONCLUIR o próprio lembrete; o autor, editar o que
-- escreveu. Texto de nota alheia editável é o custo aceito do update único —
-- documentado na spec como fora do v1 refinar isso por coluna.
create policy "anotacoes: autor ou destinatario atualizam"
  on public.anotacoes for update to authenticated
  using (corretor_id = public.corretor_atual() or destinatario_id = public.corretor_atual())
  with check (corretor_id = public.corretor_atual() or destinatario_id = public.corretor_atual());

-- Excluir é só do autor: o destinatário conclui, não apaga o que não escreveu.
create policy "anotacoes: autor exclui"
  on public.anotacoes for delete to authenticated
  using (corretor_id = public.corretor_atual());

-- Regime de tabela nova (como estudio_conversas ao contrário do de leads):
-- grants de tabela + RLS recortando. Nada de grant por coluna aqui.
-- E a chave PÚBLICA fica de fora por inteiro (tabelasSeguras.test.ts): o
-- grant padrão do Supabase incluiria anon, que vai no bundle do site.
revoke all on public.anotacoes from anon;
grant select, insert, update, delete on public.anotacoes to authenticated;
grant select, insert, update, delete on public.anotacoes to service_role;

comment on table public.anotacoes is
  'Bloco de notas do corretor: nota livre, vínculo opcional a lead, direcionável a colega, com lembrete (WhatsApp + fila do Início).';

-- Reversão:
--   drop table public.anotacoes;
