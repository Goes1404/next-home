-- 0078 — A fila de cadastro do catálogo
--
-- ## O problema
--
-- O levantamento de 01/09/2026 achou 39 lançamentos em obra ou em
-- lançamento em Barueri, dos quais **30 não estão no catálogo**. Sem um
-- lugar para guardar a decisão, o corretor reavalia os mesmos 30 a cada vez
-- que olha a lista — e "fila que não lembra" é a forma mais rápida de a
-- lista virar ruído e ninguém mais abrir.
--
-- ## O que esta tabela NÃO é
--
-- Não é catálogo. É a fila de CANDIDATOS: o que existe no mercado e ainda
-- não foi decidido. Nada aqui aparece na vitrine nem no prompt da
-- assistente — quem faz isso é `empreendimentos`, e só depois de o corretor
-- cadastrar de verdade, com material da construtora.
--
-- Guardamos nome, bairro, tipologia e o link da fonte. **Não guardamos foto
-- nem descrição**: o material publicável vem de quem produziu, e a Next
-- Home só vende o que representa.
--
-- ## A decisão é o dado que importa
--
-- `decisao` começa em `pendente`. `descartado` é tão valioso quanto
-- `cadastrar`: é ele que impede o imóvel de voltar à fila no próximo
-- levantamento. Por isso guarda também o MOTIVO — "não é da nossa
-- carteira" e "já temos com outro nome" levam a ações diferentes quando
-- alguém reabrir a lista daqui a três meses.

create table if not exists public.catalogo_candidatos (
  id uuid primary key default gen_random_uuid(),

  -- Identidade na FONTE. O par (fonte, ref_externa) é o que evita o mesmo
  -- imóvel entrar duas vezes quando o levantamento rodar de novo.
  fonte text not null default 'apto.vc',
  ref_externa text not null,

  nome text not null,
  bairro text,
  status_obra text,
  dormitorios text,
  area text,
  link text,

  decisao text not null default 'pendente'
    check (decisao in ('pendente', 'cadastrar', 'descartado', 'ja_temos')),
  motivo text,
  decidido_em timestamptz,

  -- Preenchido quando o candidato vira cadastro de verdade. É o que fecha
  -- o ciclo: dá para responder "o que desta lista já virou imóvel?".
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,

  visto_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),

  unique (fonte, ref_externa)
);

alter table public.catalogo_candidatos enable row level security;

-- Fila de trabalho da equipe: todo corretor logado vê e decide. Não há
-- recorte por corretor porque o catálogo é da imobiliária, não de um
-- corretor — diferente de `leads`.
create policy "corretor le os candidatos"
  on public.catalogo_candidatos for select
  to authenticated using (true);

create policy "corretor decide sobre o candidato"
  on public.catalogo_candidatos for update
  to authenticated using (true) with check (true);

-- Sem INSERT nem DELETE para `authenticated`: quem popula a fila é o
-- levantamento (script, com a service key). Deixar a tela inserir abriria
-- caminho para candidato digitado à mão divergir da fonte.

create index if not exists catalogo_candidatos_decisao_idx
  on public.catalogo_candidatos (decisao, nome);

comment on table public.catalogo_candidatos is
  'Fila de candidatos a cadastro, vinda de levantamento de mercado. Nao e catalogo: nada aqui aparece na vitrine nem no prompt (0078).';
