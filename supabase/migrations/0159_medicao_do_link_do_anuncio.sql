-- 0159: medir onde o clique do anúncio se perde (05/10/2026).
--
-- Em 7 dias, 679 cliques de pessoas no link do anúncio do Dom Parque viraram
-- 5 leads. O banco só sabia o total de cliques e o lead que chegou. Faltavam
-- duas perguntas:
--
--   1. Quantas PESSOAS clicaram? Um clique repetido conta várias vezes.
--      `visitante` é um resumo (hash) de IP + navegador + dia, calculado no
--      servidor com um segredo. Não dá para voltar ao IP, e muda todo dia:
--      serve para contar, não para seguir ninguém.
--
--   2. Quantos escreveram ao corretor SEM a mensagem pronta? Desde a 0144 o
--      porteiro ignora essas mensagens (o número é o WhatsApp pessoal do
--      corretor). `porteiro_barrados` guarda só a CONTAGEM: um resumo do
--      número (para contar pessoas distintas), quantos minutos depois de um
--      clique de pessoa ela chegou, e se citou o imóvel daquele clique. O
--      texto nunca é gravado.
--
-- Uma linha por número desconhecido, por corretor, por dia. Contatos
-- pessoais do corretor também caem aqui. Por isso o minuto depois do clique
-- importa: comparar quem escreveu logo após um clique com quem escreveu sem
-- clique nenhum por perto separa o cliente do ruído.

alter table public.cliques_whatsapp
  add column if not exists visitante text;

comment on column public.cliques_whatsapp.visitante is
  'Resumo (hash) de IP + navegador + dia, para contar pessoas distintas. Não identifica ninguém (0159).';

create table if not exists public.porteiro_barrados (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  dia date not null,
  criado_em timestamptz not null default now(),
  remetente text not null,
  tipo text not null check (tipo in ('texto', 'audio', 'outro')),
  minutos_desde_clique integer,
  clique_id uuid references public.cliques_whatsapp(id) on delete set null,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  citou_imovel boolean not null default false
);

comment on table public.porteiro_barrados is
  'Mensagens de número sem lead que o porteiro ignorou. Só contagem: o texto nunca é gravado (0159).';
comment on column public.porteiro_barrados.remetente is
  'Resumo (hash) do número com segredo do servidor. Conta pessoas distintas sem guardar o telefone.';
comment on column public.porteiro_barrados.minutos_desde_clique is
  'Minutos desde o clique de pessoa mais recente no link deste corretor (até 60). Nulo = nenhum clique por perto.';

create unique index if not exists porteiro_barrados_um_por_dia
  on public.porteiro_barrados (corretor_id, remetente, dia);
create index if not exists porteiro_barrados_corretor_dia_idx
  on public.porteiro_barrados (corretor_id, dia desc);

alter table public.porteiro_barrados enable row level security;

-- Tabela nova no public nasce aberta para anon e authenticated (0082, 0116).
revoke all on public.porteiro_barrados from anon;
revoke all on public.porteiro_barrados from authenticated;
grant select on public.porteiro_barrados to authenticated;

-- O corretor vê as dele; o ADM vê a equipe. São só contagens, sem texto
-- nem número, então a regra da 0134 (o ADM não lê conversa) não se aplica.
drop policy if exists "porteiro_barrados: dono e adm leem" on public.porteiro_barrados;
create policy "porteiro_barrados: dono e adm leem"
  on public.porteiro_barrados for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
