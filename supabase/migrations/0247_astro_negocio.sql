-- 0247 · o negócio da Astro: indique e ganhe e termo de adesão (29/10/2026)
--
-- Quatro funções pedidas pelo dono no mesmo dia; duas delas precisam de banco:
--
--   1. Indique e ganhe. Cada conta (grupo) tem um código de indicação
--      (`grupos.codigo_de_indicacao`, sorteado no banco, único). O link
--      `/i/<codigo>` grava o cookie `astro_indicacao` por 30 dias e leva à
--      página de vendas; `/astro/contratar?indicacao=<codigo>` faz o mesmo
--      pelo `proxy.ts`. O pedido guarda o código
--      (`pedidos_de_contratacao.codigo_de_indicacao`) e, quando a conta nasce
--      do pedido (teste grátis ou conversão na plataforma), a indicação é
--      registrada em `indicacoes` (uma por conta indicada: chave única em
--      `grupo_indicado_id`; ninguém indica a si mesmo).
--
--      A recompensa: quando a conta indicada paga a PRIMEIRA mensalidade de
--      verdade (linha de `pagamentos_do_grupo` com valor > 0; a linha de
--      valor 0 do cadastro, 0207, não conta), quem indicou ganha um crédito
--      em `creditos_de_indicacao` (src/lib/indicacoes/indicacao.ts,
--      `RECOMPENSA_DA_INDICACAO`). Um crédito por indicação: chave única em
--      `indicacao_id`, o que torna a recompensa idempotente (o webhook do
--      Asaas entrega "pelo menos uma vez"). O crédito NÃO mexe sozinho na
--      cobrança: a plataforma o vê na tela da conta e marca como aplicado
--      depois de dar o desconto (`aplicado_em`, `aplicado_por`).
--
--      As duas tabelas são GLOBAIS (src/lib/grupos/tabelasDoGrupo.ts,
--      TABELAS_GLOBAIS): ligam DUAS contas, e são atos da Astro sobre elas,
--      como `acessos_de_suporte` (0243). Por isso não têm `grupo_id` (que
--      traria o carimbo e as regras de tabela do grupo): os grupos moram em
--      `grupo_indicador_id`, `grupo_indicado_id` e `grupo_beneficiado_id`.
--      Só a chave de serviço lê e escreve; o gestor vê as indicações do
--      grupo dele pela chave filtrada pela sessão.
--
--   2. Termo de adesão (contrato do SaaS). O gestor da conta (ou o corretor
--      independente, que é gestor do próprio grupo) aceita UMA vez por
--      versão, no primeiro acesso; corretor comum não é bloqueado. O aceite
--      fica em `aceites_do_termo_de_adesao`: quem (ficha e login), quando,
--      versão, nome e e-mail do momento, hash do IP (HMAC, nunca o IP) e o
--      navegador. Uma linha por grupo e versão: o aceite é da CONTA, e dois
--      gestores aceitando ao mesmo tempo batem na chave única (o segundo é
--      tratado como já aceito).
--
--      Tabela DO GRUPO, no molde de `aceites_de_termos` (0198): carimbo da
--      0191 pela mãe `corretores`, policy restritiva de isolamento, leitura
--      só pelo gestor do grupo. Ninguém grava pela sessão: o aceite é gravado
--      pela chave de serviço na action (`src/app/corretor/termo-de-adesao/acoes.ts`),
--      depois de conferir a sessão e o papel, para o hash do IP e o
--      navegador não virem do navegador.
--
--   3. `admin_eventos`: `termo_de_adesao_aceito` e
--      `credito_de_indicacao_aplicado`. A lista é a da 0243 (que já traz as
--      da 0241) mais as duas. ATENÇÃO na junção com as frentes de 29/10
--      (0244 a 0246): se alguma delas também recriar este CHECK, a última a
--      rodar precisa trazer a UNIÃO das listas.
--
--   4. A central de ajuda (`/ajuda`) e o alerta de risco de cancelamento
--      (cron das 9h) não têm banco novo: leem o que já existe.
--
-- Nenhuma coluna nova ganha grant para o `authenticated` (como a 0207, 0234
-- e 0241): o painel lê pelo servidor.
--
-- Só aditivo. Aplicar ANTES do deploy: o painel do gestor passa a ler o
-- aceite (erro de leitura NÃO tranca o painel, mas a página do termo não
-- consegue gravar sem a tabela) e as telas leem as colunas novas.
--
-- Reversão:
--   drop table if exists public.creditos_de_indicacao;
--   drop table if exists public.indicacoes;
--   drop table if exists public.aceites_do_termo_de_adesao;
--   drop index if exists public.grupos_codigo_de_indicacao_unico;
--   alter table public.grupos drop column if exists codigo_de_indicacao;
--   alter table public.pedidos_de_contratacao drop column if exists codigo_de_indicacao;
--   e o CHECK de admin_eventos pela lista da 0243 (apagar antes as linhas
--   com as duas ações novas, se houver).

begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Código de indicação de cada conta
-- ---------------------------------------------------------------------------
--
-- O padrão é volátil (`gen_random_uuid()`): ao criar a coluna o Postgres o
-- avalia linha a linha, então cada conta que já existe ganha o próprio
-- código, e cada conta nova também. Oito caracteres hexadecimais: curto para
-- o link, e o índice único é a trava (colisão derruba a migration, que pode
-- ser reaplicada).

alter table public.grupos
  add column if not exists codigo_de_indicacao text
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
    check (codigo_de_indicacao is null or codigo_de_indicacao ~ '^[a-z0-9]{6,32}$');

comment on column public.grupos.codigo_de_indicacao is
  'Código do "indique e ganhe" da conta (link /i/<codigo>). Único; só a chave de serviço (0247).';

create unique index if not exists grupos_codigo_de_indicacao_unico
  on public.grupos (codigo_de_indicacao) where codigo_de_indicacao is not null;

alter table public.pedidos_de_contratacao
  add column if not exists codigo_de_indicacao text
    check (codigo_de_indicacao is null or codigo_de_indicacao ~ '^[a-z0-9]{6,32}$');

comment on column public.pedidos_de_contratacao.codigo_de_indicacao is
  'Código de indicação que veio com o pedido (?indicacao= ou cookie astro_indicacao). Vira linha de indicacoes quando a conta nasce (0247).';

-- ---------------------------------------------------------------------------
-- 2. Indicações (global)
-- ---------------------------------------------------------------------------

create table if not exists public.indicacoes (
  id                  uuid primary key default gen_random_uuid(),
  criado_em           timestamptz not null default now(),
  -- O código como estava no dia (a conta pode trocar de código no futuro).
  codigo              text not null check (codigo ~ '^[a-z0-9]{6,32}$'),
  grupo_indicador_id  uuid not null references public.grupos(id) on delete cascade,
  -- Uma conta é indicada uma vez só: a primeira indicação vale.
  grupo_indicado_id   uuid not null unique references public.grupos(id) on delete cascade,
  pedido_id           uuid references public.pedidos_de_contratacao(id) on delete set null,
  check (grupo_indicador_id <> grupo_indicado_id)
);

comment on table public.indicacoes is
  'Indique e ganhe (0247): qual conta indicou qual. Global (liga duas contas); só a chave de serviço lê e escreve.';

create index if not exists indicacoes_indicador_criado_em_idx
  on public.indicacoes (grupo_indicador_id, criado_em desc);

alter table public.indicacoes enable row level security;
revoke all on public.indicacoes from anon;
revoke all on public.indicacoes from authenticated;
grant all on public.indicacoes to service_role;

-- ---------------------------------------------------------------------------
-- 3. Créditos das indicações (global)
-- ---------------------------------------------------------------------------

create table if not exists public.creditos_de_indicacao (
  id                    uuid primary key default gen_random_uuid(),
  criado_em             timestamptz not null default now(),
  -- Um crédito por indicação: é a trava da idempotência da recompensa.
  indicacao_id          uuid not null unique references public.indicacoes(id) on delete cascade,
  -- Quem ganha: a conta que indicou.
  grupo_beneficiado_id  uuid not null references public.grupos(id) on delete cascade,
  -- O primeiro pagamento da conta indicada, que gerou o crédito.
  pagamento_id          uuid references public.pagamentos_do_grupo(id) on delete set null,
  percentual            numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  meses                 smallint not null check (meses between 1 and 12),
  -- Estimativa em reais pela mensalidade de quem indicou no dia; nulo sem mensalidade.
  valor_estimado        numeric(10,2) check (valor_estimado is null or valor_estimado >= 0),
  descricao             text not null check (char_length(descricao) between 1 and 200),
  aplicado_em           timestamptz,
  -- O login do administrador da plataforma (auth.users), sem FK, como 0243.
  aplicado_por          uuid,
  observacao            text check (observacao is null or char_length(observacao) <= 500),
  check ((aplicado_em is null) = (aplicado_por is null))
);

comment on table public.creditos_de_indicacao is
  'Crédito do indique e ganhe (0247): gerado no primeiro pagamento da conta indicada; a plataforma aplica à mão. Global; só a chave de serviço.';

create index if not exists creditos_de_indicacao_beneficiado_idx
  on public.creditos_de_indicacao (grupo_beneficiado_id, criado_em desc);

alter table public.creditos_de_indicacao enable row level security;
revoke all on public.creditos_de_indicacao from anon;
revoke all on public.creditos_de_indicacao from authenticated;
grant all on public.creditos_de_indicacao to service_role;

-- ---------------------------------------------------------------------------
-- 4. Aceites do termo de adesão (do grupo)
-- ---------------------------------------------------------------------------

create table if not exists public.aceites_do_termo_de_adesao (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid not null references public.grupos(id) on delete cascade,
  -- Quem aceitou: a ficha (gestor) e o login dela no momento.
  corretor_id      uuid not null references public.corretores(id) on delete cascade,
  user_id          uuid not null,
  -- A versão do texto aceito, como está em src/lib/termos/termoDeAdesao.ts.
  versao           text not null check (char_length(versao) between 1 and 60),
  aceito_em        timestamptz not null default now(),
  nome_no_aceite   text not null check (char_length(nome_no_aceite) between 1 and 200),
  email_no_aceite  text check (email_no_aceite is null or char_length(email_no_aceite) <= 320),
  -- HMAC-SHA256 do IP (hex); o IP em si nunca é guardado.
  ip_hash          text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent       text check (user_agent is null or char_length(user_agent) <= 500),
  -- O aceite é da conta: um por grupo e versão.
  unique (grupo_id, versao)
);

comment on table public.aceites_do_termo_de_adesao is
  'Aceite do termo de adesão pela conta (0247): quem, quando, versão, hash do IP e navegador. Grava só a chave de serviço; o gestor do grupo lê. Sem update nem delete.';

alter table public.aceites_do_termo_de_adesao enable row level security;

-- Tabela nova no public nasce com ALL para anon E authenticated (0116).
revoke all on public.aceites_do_termo_de_adesao from anon;
revoke all on public.aceites_do_termo_de_adesao from authenticated;
grant select on public.aceites_do_termo_de_adesao to authenticated;
grant all on public.aceites_do_termo_de_adesao to service_role;

drop policy if exists isolamento_por_grupo on public.aceites_do_termo_de_adesao;
create policy isolamento_por_grupo on public.aceites_do_termo_de_adesao as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop policy if exists "termo de adesao: o gestor le os do grupo" on public.aceites_do_termo_de_adesao;
create policy "termo de adesao: o gestor le os do grupo" on public.aceites_do_termo_de_adesao
  for select to authenticated
  using ((select public.eh_gestor()));

-- O carimbo da 0191, com a mãe `corretores`.
drop trigger if exists aceites_do_termo_de_adesao_00_grupo on public.aceites_do_termo_de_adesao;
create trigger aceites_do_termo_de_adesao_00_grupo
  before insert or update of grupo_id, corretor_id on public.aceites_do_termo_de_adesao
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists aceites_do_termo_de_adesao_zz_grupo_insert on public.aceites_do_termo_de_adesao;
create trigger aceites_do_termo_de_adesao_zz_grupo_insert
  after insert on public.aceites_do_termo_de_adesao for each row
  when (new.corretor_id is not null)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists aceites_do_termo_de_adesao_zz_grupo_update on public.aceites_do_termo_de_adesao;
create trigger aceites_do_termo_de_adesao_zz_grupo_update
  after update on public.aceites_do_termo_de_adesao for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

-- ---------------------------------------------------------------------------
-- 5. admin_eventos: termo aceito e crédito de indicação aplicado
-- ---------------------------------------------------------------------------

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (acao in (
  'conta_criada', 'senha_redefinida', 'papel_alterado', 'corretor_desativado', 'corretor_reativado',
  'leads_redistribuidos', 'numero_desconectado', 'grupo_criado', 'grupo_desfeito', 'convite_enviado',
  'convite_reenviado', 'email_alterado', 'link_de_senha_enviado', 'link_de_senha_pedido',
  'cota_da_ia_ajustada', 'identidade_da_ia_alterada', 'fichas_exportadas',
  'dados_do_grupo_exportados', 'titular_apagado', 'grupo_cancelado', 'cancelamento_desfeito',
  'dados_do_grupo_apagados', 'falha_ao_apagar_dados_do_grupo', 'copia_final_baixada', 'copia_final_apagada',
  'pagamento_registrado', 'pagamento_removido', 'grupo_suspenso', 'grupo_reativado',
  'logo_do_grupo_alterada',
  'site_do_grupo_alterado', 'endereco_do_site_ligado', 'endereco_do_site_removido',
  'plano_alterado', 'admin_da_plataforma_adicionado', 'admin_da_plataforma_removido',
  -- Teste grátis e cobrança automática do Asaas (0241).
  'teste_gratis_iniciado', 'cobranca_automatica_ligada', 'cobranca_automatica_desligada',
  -- A visão de suporte da plataforma (0243).
  'visao_de_suporte_aberta',
  -- O ramo da conta trocado pela plataforma (0244).
  'ramo_do_grupo_alterado',
  -- O negócio da Astro (0247): termo de adesão aceito pela conta e crédito
  -- de indicação aplicado pela plataforma.
  'termo_de_adesao_aceito', 'credito_de_indicacao_aplicado'
));

commit;
