-- Webhook Meta Lead Ads: novas colunas de lead, pausa temporária de
-- corretor, e a trava de concorrência que a roleta precisa agora que leads
-- podem chegar em rajada (vários anúncios gerando lead no mesmo segundo).

-- ---------------------------------------------------------------------------
-- 1. Leads vindos da Meta
-- ---------------------------------------------------------------------------

alter table leads
  -- Identifica o lead na origem. `unique` permite qualquer quantidade de
  -- linhas com NULL (leads do site continuam sem valor aqui) e é o que torna
  -- o insert do webhook idempotente a reenvios do mesmo evento.
  add column meta_lead_id text unique,
  -- Nome do anúncio (não o ad_id bruto) — o corretor não decora ID de anúncio.
  add column anuncio_origem text;

-- ---------------------------------------------------------------------------
-- 2. Pausa temporária de corretor
-- ---------------------------------------------------------------------------
--
-- Diferente de `ativo` (desligamento, perde cadastro publicável): em_pausa é
-- férias/folga — mesmo cadastro, mesmo login, só fora da roleta enquanto
-- durar.

alter table corretores
  add column em_pausa boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Roleta: filtro de pausa + trava de concorrência
-- ---------------------------------------------------------------------------
--
-- A seleção de corretor lê `count`/`max` de `leads` via subquery, sem travar
-- linha nenhuma. Em READ COMMITTED, dois leads entrando no mesmo segundo (o
-- caso que o webhook torna comum) podem escolher o mesmo corretor, porque
-- nenhuma das duas transações concorrentes enxerga o insert da outra antes de
-- qualquer uma commitar. `pg_advisory_xact_lock` serializa as execuções desta
-- função: quem chega depois espera a primeira liberar (fim da transação)
-- antes de rodar sua própria seleção — nesse ponto já enxerga o lead que
-- acabou de entrar.

create or replace function public.distribuir_lead() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  alvo uuid;
  cidade_lead text;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
   where c.ativo
     and not c.em_pausa
     and c.user_id is not null
     and c.slug is not null
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc
   limit 1;

  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Gestor pode alternar a escala
-- ---------------------------------------------------------------------------
--
-- `corretores` hoje só tem a policy de select pública (0001) — nenhum update
-- é possível pelo cliente autenticado. Sem isso o toggle de em_pausa não tem
-- como gravar.

create policy "gestor atualiza escala"
  on corretores for update
  to authenticated
  using (eh_gestor())
  with check (eh_gestor());

grant update (ativo, em_pausa) on corretores to authenticated;
