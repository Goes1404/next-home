-- 0030 — Contas de acesso e papel administráveis pelo painel
--
-- O buraco que esta migration fecha: dos 8 corretores cadastrados, apenas 1
-- conseguia entrar no sistema. Os outros 7 têm ficha, aparecem no site e JÁ
-- RECEBEM LEADS — mas sem `user_id` não há login, então ninguém atende o que
-- recebe. Criar acesso exigia trabalho manual no Supabase (usuário no Auth +
-- vincular a linha + gerar slug), e promover alguém era um UPDATE no SQL
-- Editor. Nada disso tinha caminho pela aplicação.

-- ---------------------------------------------------------------------------
-- Senha provisória
-- ---------------------------------------------------------------------------
-- Não há serviço de e-mail no projeto (sem SMTP, sem Resend): o convite por
-- link não existe como opção. O gestor gera uma senha temporária e repassa;
-- esta coluna é o que faz o sistema exigir a troca no primeiro acesso.
alter table public.corretores
  add column if not exists deve_trocar_senha boolean not null default false;

-- Grant só desta coluna. Não é fronteira de segurança: a policy da 0006 já
-- autoriza o corretor a editar a própria linha, e quem "burlasse" isto só
-- deixaria de ser lembrado de trocar a própria senha.
grant update (deve_trocar_senha) on public.corretores to authenticated;

-- ---------------------------------------------------------------------------
-- Trilha de auditoria administrativa
-- ---------------------------------------------------------------------------
create table if not exists public.admin_eventos (
  id uuid primary key default gen_random_uuid(),
  ator_id uuid references public.corretores(id) on delete set null,
  acao text not null check (acao in (
    'conta_criada',
    'senha_redefinida',
    'papel_alterado',
    'corretor_desativado',
    'corretor_reativado',
    'leads_redistribuidos'
  )),
  alvo_corretor_id uuid references public.corretores(id) on delete set null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_eventos_created_idx
  on public.admin_eventos (created_at desc);

alter table public.admin_eventos enable row level security;

create policy "gestor le a auditoria" on public.admin_eventos
  for select to authenticated using (public.eh_gestor());

-- Sem policy de INSERT, de propósito: só escrevem as funções `security
-- definer` abaixo e o cliente de serviço. Log que o próprio ator pode
-- forjar ou apagar não é log — é decoração.

-- ---------------------------------------------------------------------------
-- Nunca ficar sem gestor
-- ---------------------------------------------------------------------------
/**
 * Barra a última porta de saída da administração.
 *
 * Vale para despromoção E para desativação: `ativo` tem grant e policy de
 * gestor desde a 0008, então dá para se desligar por dois caminhos. A trava
 * mora no banco justamente porque a UI é só um deles — sem gestor ativo,
 * ninguém cria conta, promove ninguém nem reajusta preço, e o conserto volta
 * a ser SQL manual.
 */
create or replace function public.garantir_gestor_remanescente()
returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if old.papel = 'gestor'
     and (new.papel <> 'gestor' or new.ativo = false)
     and (
       select count(*) from corretores
       where papel = 'gestor' and ativo and id <> old.id
     ) = 0
  then
    raise exception 'A imobiliária ficaria sem nenhum gestor ativo.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists corretores_gestor_remanescente on public.corretores;
create trigger corretores_gestor_remanescente
  before update on public.corretores
  for each row execute function public.garantir_gestor_remanescente();

-- ---------------------------------------------------------------------------
-- Promover / despromover
-- ---------------------------------------------------------------------------
/**
 * Muda o papel de um corretor.
 *
 * Por que uma função e NÃO um `grant update (papel)`: a RLS é permissiva por
 * OR, e a policy "corretor edita o proprio cadastro" (0006) já autoriza a
 * própria linha. Um grant em `papel` deixaria QUALQUER corretor se
 * autopromover a gestor com um update trivial. Aqui a decisão passa por
 * `eh_gestor()` antes de qualquer escrita.
 */
create or replace function public.definir_papel_corretor(
  alvo uuid,
  novo_papel text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  eu uuid := corretor_atual();
begin
  if not eh_gestor() then
    raise exception 'Só quem administra a imobiliária altera papéis.'
      using errcode = '42501';
  end if;

  if novo_papel not in ('corretor', 'gestor') then
    raise exception 'Papel inválido: %', novo_papel;
  end if;

  -- Autodespromoção fica de fora mesmo havendo outro gestor: é o erro que
  -- mais se comete sem querer, e desfazê-lo exigiria justamente o acesso que
  -- se acabou de perder.
  if alvo = eu and novo_papel <> 'gestor' then
    raise exception 'Peça a outro gestor para remover o seu acesso administrativo.'
      using errcode = '42501';
  end if;

  update corretores set papel = novo_papel where id = alvo;

  insert into admin_eventos (ator_id, acao, alvo_corretor_id, detalhes)
  values (eu, 'papel_alterado', alvo, jsonb_build_object('papel', novo_papel));
end;
$$;

revoke all on function public.definir_papel_corretor(uuid, text) from public, anon;
grant execute on function public.definir_papel_corretor(uuid, text) to authenticated;
