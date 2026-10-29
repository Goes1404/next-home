-- 0243 · acessos da visão de suporte da Astro (29/10/2026)
--
-- Pedido do dono: o administrador da plataforma ganha a "visão de suporte"
-- de UMA conta (`/plataforma/grupos/<id>/suporte`): funil em números (só
-- contagens), equipe, status do WhatsApp de cada corretor, uso da IA,
-- limites, cobrança e endereços. NUNCA conversa, mensagem, dossiê, nota nem
-- identidade de lead (nome, telefone, e-mail) — a guarda
-- `servicoComGrupo.test.ts` (categoria `plataforma-admin`) cobra isso.
--
-- Todo acesso fica registrado ANTES de a tela abrir: a action
-- `abrirVisaoDeSuporte` (src/app/plataforma/visaoDeSuporteAcoes.ts) grava a
-- linha aqui e só então redireciona para a página com `?acesso=<id>`; sem
-- uma linha recente do próprio administrador para aquele grupo, a página não
-- mostra número nenhum. E o gestor da conta vê a lista dos acessos na
-- visão geral do painel ("Acessos do suporte da Astro"), lida pela chave de
-- serviço filtrando o grupo da sessão.
--
-- Tabela GLOBAL (src/lib/grupos/tabelasDoGrupo.ts, TABELAS_GLOBAIS): o
-- acesso é um ato da Astro SOBRE a conta, não dado da conta. Por isso NÃO tem
-- `grupo_id` (que traria o carimbo `<tabela>_00_grupo` e as regras de
-- isolamento): o grupo acessado mora em `grupo_alvo_id`, como o
-- `grupo_origem_id` dos chamados (0240). Apagar o grupo leva os registros
-- junto (`on delete cascade`): sem a conta, não há a quem mostrar.
--
-- Ninguém além da chave de serviço toca a tabela: RLS ligada e SEM policy;
-- `anon` e `authenticated` perdem todo grant.
--
-- O mesmo acesso também vai para `admin_eventos` (rastro do grupo, como as
-- outras ações da plataforma): o CHECK de `acao` é recriado com a lista da
-- 0237 mais `visao_de_suporte_aberta`. Sem esta migration o insert do evento
-- falha e só vai ao log; o da tabela nova também falha, e aí a tela NÃO abre
-- (o registro é condição de abrir). Aplicar ANTES do deploy.
--
-- Só aditivo. Reversão: `drop table public.acessos_de_suporte;` e recriar o
-- CHECK com a lista da 0237 (apagar antes as linhas `visao_de_suporte_aberta`
-- de `admin_eventos`, se houver).

begin;
set local lock_timeout = '5s';

create table if not exists public.acessos_de_suporte (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),
  -- O login do administrador da plataforma (auth.users), sem FK: o rastro
  -- fica mesmo que o login seja removido depois.
  admin_user_id  uuid not null,
  grupo_alvo_id  uuid not null references public.grupos(id) on delete cascade,
  motivo         text check (motivo is null or length(btrim(motivo)) between 1 and 200)
);

comment on table public.acessos_de_suporte is
  'Acessos da visão de suporte da plataforma a UM grupo (0243). Global (sem grupo_id; o grupo é grupo_alvo_id); só a chave de serviço lê e escreve.';

-- A lista do gestor (acessos do grupo dele, mais novos primeiro) e a
-- conferência da página (o acesso recente do administrador para o grupo).
create index if not exists acessos_de_suporte_grupo_criado_em_idx
  on public.acessos_de_suporte (grupo_alvo_id, criado_em desc);

alter table public.acessos_de_suporte enable row level security;
revoke all on public.acessos_de_suporte from anon;
revoke all on public.acessos_de_suporte from authenticated;
grant all on public.acessos_de_suporte to service_role;

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
  -- A visão de suporte da plataforma aberta para o grupo (0243).
  'visao_de_suporte_aberta',
  -- Os da 0241 (cobrança Asaas e teste grátis), que vem antes na numeração:
  -- reconstruir o CHECK sem eles os derrubaria num banco recriado do zero.
  'teste_gratis_iniciado', 'cobranca_automatica_ligada', 'cobranca_automatica_desligada'
));

commit;
