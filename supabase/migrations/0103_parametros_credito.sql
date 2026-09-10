-- 0103 — Parâmetros de crédito: uma linha, seedada, editável pelo gestor
--
-- ## Por que nasce PREENCHIDA
--
-- Esta base registra sete recursos completos que nunca produziram uma linha
-- porque dependiam de alguém abrir uma tela. Tela de ajustes tem exatamente
-- esse risco. A migration escreve os valores vigentes; a tela só EDITA — o
-- consultor funciona no minuto em que subir, e nunca depende de configuração
-- que ninguém preencheu (a mesma regra do link do catálogo, que só entra no
-- prompt quando o slug existe).
--
-- ## Por que UMA linha
--
-- Não há versionamento nem histórico: o que interessa é o que vale HOJE, e
-- `conferido_em` diz há quanto tempo. Histórico de parâmetro de crédito é
-- tabela que ninguém consulta — o erro do `historico_envios`.
--
-- ## Quem escreve
--
-- Só o gestor, e só pela função abaixo. `papel` ensinou a lição: grant de
-- update numa tabela que a RLS deixa o corretor tocar é como alguém se
-- autopromove. Aqui `authenticated` só LÊ.

create table public.parametros_credito (
  -- Sempre true: o check garante linha unica sem precisar de trigger.
  id                     boolean primary key default true check (id),
  faixas                 jsonb not null,
  teto_fgts_imovel       numeric(12,2) not null,
  taxa_sbpe_anual        numeric(6,4) not null,
  prazo_maximo_meses     integer not null,
  comprometimento_maximo numeric(4,3) not null,
  itbi_por_cidade        jsonb not null,
  conferido_em           date not null,
  conferido_por          uuid references public.corretores(id) on delete set null,
  atualizado_em          timestamptz not null default now()
);

insert into public.parametros_credito (
  faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
  comprometimento_maximo, itbi_por_cidade, conferido_em
) values (
  '[
    {"nome":"Faixa 1","rendaMax":2850,"subsidioMaximo":55000,"taxaAnual":0.0450},
    {"nome":"Faixa 2","rendaMax":4700,"subsidioMaximo":29000,"taxaAnual":0.0600},
    {"nome":"Faixa 3","rendaMax":8000,"subsidioMaximo":0,"taxaAnual":0.0766},
    {"nome":"Faixa 4","rendaMax":12000,"subsidioMaximo":0,"taxaAnual":0.1000}
  ]'::jsonb,
  350000, 0.1149, 420, 0.30,
  '{"Barueri":0.02,"Osasco":0.02,"Santana de Parnaiba":0.02,"Sao Paulo":0.03}'::jsonb,
  date '2026-09-09'
);

alter table public.parametros_credito enable row level security;

create policy "todo corretor logado le os parametros de credito"
  on public.parametros_credito for select to authenticated
  using (true);

-- Os dois passos obrigatórios desta base (0077, 0080, 0082).
revoke all on public.parametros_credito from anon;
revoke insert, update, delete, truncate on public.parametros_credito from authenticated;

-- ---------------------------------------------------------------------------
-- A escrita, só pelo gestor
-- ---------------------------------------------------------------------------
--
-- `security definer` pelo mesmo motivo de `definir_papel_corretor`: quem
-- decide é o PAPEL, e o papel não pode ser conferido por policy de update
-- numa tabela em que `authenticated` não tem grant nenhum.

create or replace function public.atualizar_parametros_credito(
  p_faixas                 jsonb,
  p_teto_fgts_imovel       numeric,
  p_taxa_sbpe_anual        numeric,
  p_prazo_maximo_meses     integer,
  p_comprometimento_maximo numeric,
  p_itbi_por_cidade        jsonb,
  p_conferido_em           date
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corretor uuid;
begin
  select id into v_corretor
    from public.corretores
   where user_id = auth.uid() and papel = 'gestor' and ativo;

  if v_corretor is null then
    return false;
  end if;

  -- Recusa o absurdo aqui, e não só na tela: comprometimento de 90% ou taxa
  -- negativa entrariam por qualquer chamada direta ao PostgREST, e a conta do
  -- consultor passaria a mentir para todo mundo.
  if p_comprometimento_maximo <= 0 or p_comprometimento_maximo > 0.5 then return false; end if;
  if p_taxa_sbpe_anual <= 0 or p_taxa_sbpe_anual > 1 then return false; end if;
  if p_teto_fgts_imovel <= 0 then return false; end if;
  if p_prazo_maximo_meses < 12 or p_prazo_maximo_meses > 480 then return false; end if;
  if jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) = 0 then return false; end if;
  if jsonb_typeof(p_itbi_por_cidade) <> 'object' then return false; end if;

  update public.parametros_credito
     set faixas = p_faixas,
         teto_fgts_imovel = p_teto_fgts_imovel,
         taxa_sbpe_anual = p_taxa_sbpe_anual,
         prazo_maximo_meses = p_prazo_maximo_meses,
         comprometimento_maximo = p_comprometimento_maximo,
         itbi_por_cidade = p_itbi_por_cidade,
         conferido_em = p_conferido_em,
         conferido_por = v_corretor,
         atualizado_em = now()
   where id;

  return true;
end;
$$;

revoke all on function public.atualizar_parametros_credito(jsonb, numeric, numeric, integer, numeric, jsonb, date) from anon;

comment on table public.parametros_credito is
  'Linha unica com faixas do MCMV, teto do FGTS, taxa SBPE e ITBI. Seedada na 0102; editada so por gestor via atualizar_parametros_credito.';
comment on column public.parametros_credito.conferido_em is
  'Data da ultima conferencia na fonte. Viaja para o prompt: numero de credito sem data e numero que ninguem sabe se ainda vale.';
