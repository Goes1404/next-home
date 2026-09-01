-- 0073 — A agenda de visitas do corretor (roadmap geral, H4 · fase 0)
--
-- ## O que existia
--
-- "Visita" era um campo solto: `leads.visita_agendada_em` mais a etapa do
-- funil. Não havia agenda — nem que dias o corretor recebe, nem que
-- horários já estão ocupados. A consequência apareceu medida no eval de
-- conversa de 31/08: a IA OFERECE HORÁRIO QUE ELA INVENTA ("terça às 10h ou
-- quarta às 15h"), repetiu os mesmos dois quatro vezes seguidas, e nada no
-- sistema sabia dizer se aquele horário existia ou se já estava tomado.
--
-- O número que isso produz está no funil que a 0072 acendeu: **6 conversas
-- com visita proposta, 1 visita marcada**. Propor horário inventado é a
-- forma mais barata de perder a visita — o cliente aceita, o corretor não
-- pode, e alguém tem de desmarcar.
--
-- ## A grade semanal, e por que ela é semanal
--
-- Corretor não tem agenda de escritório: tem "sábado de manhã eu recebo,
-- terça à tarde não". O que se repete é a SEMANA. Uma tabela de exceções
-- por data seria mais poderosa e ninguém preencheria — a régua desta casa é
-- que o corretor quer o mínimo de decisão possível (diretriz do Painel de
-- Bolso). Exceção de uma data específica fica para a fase 1, quando houver
-- alguém pedindo.

create table if not exists public.corretor_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  -- 0 = domingo, 6 = sábado (mesma convenção de `Date.getDay`, para não
  -- haver conversão no meio do caminho — conversão de dia é onde este
  -- projeto já se queimou com fuso).
  dia_semana smallint not null check (dia_semana between 0 and 6),
  -- Hora local de São Paulo, inteira. Meia hora não existe de propósito:
  -- visita de imóvel não começa 10h30, e o meio-termo dobraria a grade da
  -- tela sem ninguém pedir.
  hora_inicio smallint not null check (hora_inicio between 6 and 21),
  hora_fim smallint not null check (hora_fim between 7 and 22),
  criado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  -- Uma faixa por dia da semana: duas faixas no mesmo dia ("manhã e fim da
  -- tarde") são a fase 1. Sem a trava, a tela deixaria criar faixas
  -- sobrepostas e a geração de horários repetiria o mesmo slot.
  unique (corretor_id, dia_semana)
);

alter table public.corretor_disponibilidade enable row level security;

-- O corretor cuida da própria agenda; o gestor vê a da equipe (mesma régua
-- da 0031, em que as tabelas de WhatsApp se abriram para o gestor).
create policy "corretor le a propria disponibilidade"
  on public.corretor_disponibilidade for select
  to authenticated
  using (
    corretor_id in (select id from public.corretores where user_id = auth.uid())
    or exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.papel = 'gestor'
    )
  );

create policy "corretor escreve a propria disponibilidade"
  on public.corretor_disponibilidade for insert
  to authenticated
  with check (corretor_id in (select id from public.corretores where user_id = auth.uid()));

create policy "corretor apaga a propria disponibilidade"
  on public.corretor_disponibilidade for delete
  to authenticated
  using (corretor_id in (select id from public.corretores where user_id = auth.uid()));

-- Sem UPDATE de propósito: a tela grava a grade inteira (apaga e insere), e
-- uma faixa "editada" é indistinguível de uma nova. Menos caminho, menos
-- estado para divergir.

comment on table public.corretor_disponibilidade is
  'Grade SEMANAL de quando o corretor recebe visita. Alimenta os horários que a IA pode oferecer (0073).';

-- Índice para a leitura que acontece a cada conversa: a grade de UM
-- corretor, na ordem do dia.
create index if not exists corretor_disponibilidade_corretor_idx
  on public.corretor_disponibilidade (corretor_id, dia_semana);
