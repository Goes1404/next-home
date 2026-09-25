-- 0114 — Vendas: o registro que o funil nunca teve (25/09/2026).
--
-- Até aqui o funil terminava em `leads.etapa = 'fechado'`, um estado de
-- cartão: sem valor, sem unidade, sem comissão, sem data de assinatura. Esta
-- migration é a F1 do módulo financeiro (comissão, extrato, ranking de VGV e
-- desempenho por corretor vêm dela).
--
-- ## O desenho em cinco decisões
--
-- 1. Duas tabelas, porque uma venda pode ter MAIS DE UM corretor
--    (co-corretagem: um captou, outro fechou). `vendas` é o fato da venda;
--    `venda_participantes` diz quem participou, com que parte do VGV e com
--    quanto da comissão. Uma coluna `corretor_id` só obrigaria a migrar os
--    dados no dia da primeira venda dividida.
-- 2. Comissão em % E em R$, as duas gravadas. O corretor digita uma e a tela
--    calcula a outra; recalcular dinheiro depois dá centavo diferente.
-- 3. Distrato é status, não exclusão. Venda distratada fica na história (e
--    no desempenho), mas sai do VGV do ranking.
-- 4. O corretor registra e edita a própria venda; só o GESTOR marca
--    "comissão recebida da construtora" e "repasse pago ao corretor". Isso é
--    garantido por GRANT DE COLUNA: as duas datas não têm grant de update
--    para `authenticated`, então nem a API aceita. O gestor marca por função
--    `security definer` na F2.
-- 5. Venda + participantes são gravados juntos por `salvar_venda`, numa
--    transação. Com duas chamadas separadas, trocar a lista de participantes
--    passaria por um instante sem ninguém — e uma falha no meio deixaria a
--    venda órfã de corretor.

create table public.vendas (
  id                    uuid primary key default gen_random_uuid(),
  -- Quem REGISTROU (e pode editar). Participar é outra coisa: ver
  -- `venda_participantes`.
  corretor_id           uuid not null references public.corretores(id) on delete restrict,
  -- Opcional: venda antiga (planilha) não tem lead. Lead excluído não apaga
  -- a venda — dinheiro não some porque um cadastro foi limpo.
  lead_id               uuid references public.leads(id) on delete set null,
  empreendimento_id     uuid references public.empreendimentos(id) on delete set null,
  -- Nome livre quando o imóvel não está no catálogo (planilha, revenda) e,
  -- para os do catálogo, o nome do dia da venda (`salvar_venda` preenche):
  -- se o imóvel sair do catálogo, a venda continua dizendo o que foi vendido.
  imovel_descricao      text,
  unidade               text,
  data_venda            date not null,
  valor_venda           numeric(14, 2) not null check (valor_venda > 0),
  comissao_percentual   numeric(6, 3) check (comissao_percentual is null or (comissao_percentual >= 0 and comissao_percentual <= 100)),
  comissao_valor        numeric(14, 2) not null check (comissao_valor >= 0),
  status                text not null default 'ativa' check (status in ('ativa', 'distratada')),
  distratada_em         date,
  -- Só o gestor (sem grant de update para authenticated).
  comissao_recebida_em  date,
  observacao            text,
  created_at            timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  constraint vendas_tem_imovel check (empreendimento_id is not null or nullif(btrim(imovel_descricao), '') is not null),
  constraint vendas_distrato_coerente check ((status = 'distratada') = (distratada_em is not null))
);

create table public.venda_participantes (
  venda_id              uuid not null references public.vendas(id) on delete cascade,
  corretor_id           uuid not null references public.corretores(id) on delete restrict,
  -- A parte do VGV creditada a ele no ranking. A soma por venda é 100.
  parte_percentual      numeric(6, 3) not null check (parte_percentual > 0 and parte_percentual <= 100),
  -- Quanto da comissão fica com ele (% da comissão da imobiliária) e em R$.
  repasse_percentual    numeric(6, 3) check (repasse_percentual is null or (repasse_percentual >= 0 and repasse_percentual <= 100)),
  repasse_valor         numeric(14, 2) not null check (repasse_valor >= 0),
  -- Só o gestor (sem grant de update para authenticated).
  repasse_pago_em       date,
  primary key (venda_id, corretor_id)
);

create index vendas_data_idx on public.vendas (data_venda desc);
create index vendas_corretor_idx on public.vendas (corretor_id);
create index vendas_lead_idx on public.vendas (lead_id) where lead_id is not null;
create index vendas_empreendimento_idx on public.vendas (empreendimento_id) where empreendimento_id is not null;
create index venda_participantes_corretor_idx on public.venda_participantes (corretor_id);

-- A policy de `vendas` precisa perguntar "ele participa?", e a de
-- `venda_participantes` precisa perguntar "ele registrou a venda?". Com as
-- duas perguntas feitas por subconsulta sob RLS, uma chamaria a outra em
-- recursão infinita. Esta função lê participantes SEM RLS e quebra o ciclo;
-- ela só responde sim/não sobre o próprio usuário.
create or replace function public.participa_da_venda(p_venda uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venda_participantes p
    where p.venda_id = p_venda and p.corretor_id = public.corretor_atual()
  );
$$;

revoke all on function public.participa_da_venda(uuid) from public, anon;
grant execute on function public.participa_da_venda(uuid) to authenticated;

alter table public.vendas enable row level security;
alter table public.venda_participantes enable row level security;

-- Ler: quem registrou, quem participou, e o gestor. O RANKING (que todos
-- veem) não sai daqui: sai de uma função da F3 que devolve só VGV, sem
-- comissão de ninguém.
create policy "vendas: registrador, participante ou gestor leem"
  on public.vendas for select to authenticated
  using (
    corretor_id = (select public.corretor_atual())
    or (select public.eh_gestor())
    or public.participa_da_venda(id)
  );

create policy "vendas: corretor registra a propria"
  on public.vendas for insert to authenticated
  with check (corretor_id = (select public.corretor_atual()));

-- Editar só enquanto a construtora não pagou: depois disso o valor virou
-- dinheiro recebido, e só o gestor corrige.
create policy "vendas: registrador edita ate a comissao entrar; gestor sempre"
  on public.vendas for update to authenticated
  using (
    (corretor_id = (select public.corretor_atual()) and comissao_recebida_em is null)
    or (select public.eh_gestor())
  )
  with check (
    (corretor_id = (select public.corretor_atual()) and comissao_recebida_em is null)
    or (select public.eh_gestor())
  );

create policy "vendas: registrador exclui ate a comissao entrar; gestor sempre"
  on public.vendas for delete to authenticated
  using (
    (corretor_id = (select public.corretor_atual()) and comissao_recebida_em is null)
    or (select public.eh_gestor())
  );

create policy "venda_participantes: quem ve a venda ve a divisao"
  on public.venda_participantes for select to authenticated
  using (
    corretor_id = (select public.corretor_atual())
    or (select public.eh_gestor())
    or public.participa_da_venda(venda_id)
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id and v.corretor_id = (select public.corretor_atual())
    )
  );

-- Escrever a divisão é de quem registrou a venda (enquanto editável) ou do
-- gestor. O `exists` em `vendas` passa pela RLS de `vendas`, que não volta
-- aqui (usa a função), então não há recursão.
create policy "venda_participantes: registrador ou gestor escrevem"
  on public.venda_participantes for insert to authenticated
  with check (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.comissao_recebida_em is null
    )
  );

create policy "venda_participantes: registrador ou gestor atualizam"
  on public.venda_participantes for update to authenticated
  using (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.comissao_recebida_em is null
    )
  );

create policy "venda_participantes: registrador ou gestor excluem"
  on public.venda_participantes for delete to authenticated
  using (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.comissao_recebida_em is null
    )
  );

-- Grants. A chave pública fica de fora por inteiro (tabelasSeguras.test.ts).
-- UPDATE é por coluna: as duas datas de dinheiro recebido/pago ficam sem
-- grant, e é isso que impede o corretor de marcar a própria comissão como
-- paga — a policy sozinha não distingue colunas.
revoke all on public.vendas from anon;
revoke all on public.venda_participantes from anon;

grant select, insert, delete on public.vendas to authenticated;
grant update (
  lead_id, empreendimento_id, imovel_descricao, unidade, data_venda, valor_venda,
  comissao_percentual, comissao_valor, status, distratada_em, observacao, atualizado_em
) on public.vendas to authenticated;

grant select, insert, delete on public.venda_participantes to authenticated;
grant update (parte_percentual, repasse_percentual, repasse_valor)
  on public.venda_participantes to authenticated;

grant all on public.vendas to service_role;
grant all on public.venda_participantes to service_role;

-- Grava a venda e a divisão numa transação só. SECURITY INVOKER: as policies
-- e os grants acima valem aqui dentro exatamente como na API — a função não
-- abre porta nenhuma, só junta duas escritas.
--
-- `p_venda` é null para venda nova. `p_participantes` é um array JSON de
-- { corretor_id, parte_percentual, repasse_percentual, repasse_valor }.
create or replace function public.salvar_venda(
  p_venda uuid,
  p_dados jsonb,
  p_participantes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_soma numeric;
  v_qtd int;
begin
  if p_participantes is null or jsonb_typeof(p_participantes) <> 'array' then
    raise exception 'participantes_invalidos';
  end if;

  select count(*), coalesce(sum((p->>'parte_percentual')::numeric), 0)
    into v_qtd, v_soma
    from jsonb_array_elements(p_participantes) p;

  if v_qtd = 0 then
    raise exception 'sem_participantes';
  end if;
  if abs(v_soma - 100) > 0.01 then
    raise exception 'partes_nao_somam_100';
  end if;

  if p_venda is null then
    insert into public.vendas (
      corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda,
      valor_venda, comissao_percentual, comissao_valor, status, distratada_em, observacao
    ) values (
      public.corretor_atual(),
      nullif(p_dados->>'lead_id', '')::uuid,
      nullif(p_dados->>'empreendimento_id', '')::uuid,
      -- O nome do imóvel vai junto: se ele sair do catálogo (set null), a
      -- venda continua dizendo o que foi vendido.
      coalesce(
        nullif(btrim(p_dados->>'imovel_descricao'), ''),
        (select e.nome from public.empreendimentos e where e.id = nullif(p_dados->>'empreendimento_id', '')::uuid)
      ),
      nullif(btrim(p_dados->>'unidade'), ''),
      (p_dados->>'data_venda')::date,
      (p_dados->>'valor_venda')::numeric,
      nullif(p_dados->>'comissao_percentual', '')::numeric,
      (p_dados->>'comissao_valor')::numeric,
      coalesce(p_dados->>'status', 'ativa'),
      nullif(p_dados->>'distratada_em', '')::date,
      nullif(btrim(p_dados->>'observacao'), '')
    )
    returning id into v_id;
  else
    update public.vendas set
      lead_id             = nullif(p_dados->>'lead_id', '')::uuid,
      empreendimento_id   = nullif(p_dados->>'empreendimento_id', '')::uuid,
      imovel_descricao    = coalesce(
        nullif(btrim(p_dados->>'imovel_descricao'), ''),
        (select e.nome from public.empreendimentos e where e.id = nullif(p_dados->>'empreendimento_id', '')::uuid)
      ),
      unidade             = nullif(btrim(p_dados->>'unidade'), ''),
      data_venda          = (p_dados->>'data_venda')::date,
      valor_venda         = (p_dados->>'valor_venda')::numeric,
      comissao_percentual = nullif(p_dados->>'comissao_percentual', '')::numeric,
      comissao_valor      = (p_dados->>'comissao_valor')::numeric,
      status              = coalesce(p_dados->>'status', 'ativa'),
      distratada_em       = nullif(p_dados->>'distratada_em', '')::date,
      observacao          = nullif(btrim(p_dados->>'observacao'), ''),
      atualizado_em       = now()
    where id = p_venda
    returning id into v_id;

    if v_id is null then
      -- A RLS escondeu a linha: não é dele, ou a comissão já entrou.
      raise exception 'venda_nao_editavel';
    end if;

    delete from public.venda_participantes where venda_id = v_id;
  end if;

  insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor)
  select
    v_id,
    (p->>'corretor_id')::uuid,
    (p->>'parte_percentual')::numeric,
    nullif(p->>'repasse_percentual', '')::numeric,
    (p->>'repasse_valor')::numeric
  from jsonb_array_elements(p_participantes) p;

  return v_id;
end;
$$;

revoke all on function public.salvar_venda(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_venda(uuid, jsonb, jsonb) to authenticated;

comment on table public.vendas is
  'Venda registrada pelo corretor: VGV, comissão da imobiliária, distrato. Base do módulo financeiro.';
comment on table public.venda_participantes is
  'Quem participou de cada venda (co-corretagem): parte do VGV no ranking e repasse da comissão.';

-- Reversão:
--   drop function public.salvar_venda(uuid, jsonb, jsonb);
--   drop table public.venda_participantes;
--   drop table public.vendas;
--   drop function public.participa_da_venda(uuid);
