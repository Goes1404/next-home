-- 0217: roleta dos anúncios com "aviso no grupo para ligar" (26/10/2026).
--
-- Desenho: docs/superpowers/specs/2026-10-26-ligacao-primeiro-e-retorno-pelo-grupo-design.md
-- (seções 5.1 a 5.3).
--
-- 1. `roleta_anuncios.modo_aviso`: como o escolhido fica sabendo do lead —
--    'mensagem' (o número dele manda a abertura, como desde a 0204) ou
--    'grupo' (o número central avisa no grupo dele; nada sai do número dele).
-- 2. `proximo_da_roleta` ganha o modo e passa a pular quem está em pausa ou
--    com conta oculta, como `distribuir_lead` já faz. No modo 'grupo' o
--    filtro deixa de ser "WhatsApp conectado" e vira "tem grupo mapeado",
--    porque quem manda é o número central.
-- 3. `lead_envios_grupo.status` aceita 'cancelado' (aviso que perdeu o
--    sentido, por exemplo porque o lead mudou de dono antes do envio).
-- 4. `enfileirar_aviso_do_lead`: a 0215 enfileira no INSERT, com o dono do
--    instante (quem pagou o anúncio), antes de a roleta agir. Esta função
--    deixa a roleta (servidor) refazer o aviso para o DONO ATUAL, sem
--    reabrir aviso que já foi enviado.
--
-- Aditiva: o gatilho da 0215 não muda; o código antigo segue valendo.

begin;

set local lock_timeout = '5s';

alter table public.roleta_anuncios
  add column if not exists modo_aviso text not null default 'mensagem';

alter table public.roleta_anuncios
  drop constraint if exists roleta_anuncios_modo_aviso_check;
alter table public.roleta_anuncios
  add constraint roleta_anuncios_modo_aviso_check check (modo_aviso in ('mensagem', 'grupo'));

comment on column public.roleta_anuncios.modo_aviso is
  'Como o escolhido fica sabendo: mensagem do número dele (0204) ou aviso no grupo dele pelo número central (0217).';

-- A coluna `status` nasceu com check inline na 0215 (nome padrão do Postgres).
alter table public.lead_envios_grupo
  drop constraint if exists lead_envios_grupo_status_check;
alter table public.lead_envios_grupo
  add constraint lead_envios_grupo_status_check
  check (status in ('pendente', 'enviando', 'enviado', 'erro', 'cancelado'));

-- A assinatura nova tem 3 argumentos; sem o drop ficariam duas funções e a
-- chamada com 2 argumentos viraria ambígua.
drop function if exists public.proximo_da_roleta(uuid, uuid[]);

create or replace function public.proximo_da_roleta(
  p_corretor uuid,
  p_excluir uuid[] default '{}',
  p_modo text default 'mensagem'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r     public.roleta_anuncios;
  n     integer;
  i     integer;
  idx   integer;
  cand  uuid;
begin
  if p_modo not in ('mensagem', 'grupo') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;

  select * into r from public.roleta_anuncios where corretor_id = p_corretor for update;
  if not found or not r.ligada then
    return null;
  end if;

  -- No modo grupo quem avisa é o número central: sem o envio para grupos
  -- ligado e com número escolhido, ninguém recebe o aviso.
  if p_modo = 'grupo' and not exists (
    select 1
      from public.grupos g
     where g.id = r.grupo_id
       and g.envio_grupo_leads_ativo
       and g.envio_grupo_leads_instancia is not null
  ) then
    return null;
  end if;

  n := coalesce(array_length(r.destinos, 1), 0);
  if n = 0 then
    return null;
  end if;
  for i in 1 .. n loop
    idx := (r.ultimo_indice + i) % n;
    if idx < 0 then
      idx := idx + n;
    end if;
    cand := r.destinos[idx + 1];
    if cand is null or cand = any (coalesce(p_excluir, '{}')) then
      continue;
    end if;
    if exists (
      select 1
        from public.corretores c
       where c.id = cand
         and c.ativo
         and not c.em_pausa
         and not c.oculta
         and c.grupo_id = r.grupo_id
         and (
           (p_modo = 'grupo' and c.whatsapp_grupo_leads_jid is not null)
           or (
             p_modo = 'mensagem'
             and exists (
               select 1
                 from public.corretor_whatsapp_instancias w
                where w.corretor_id = c.id
                  and w.status_conexao = 'conectado'
                  and w.sessao_caida_em is null
             )
           )
         )
    ) then
      update public.roleta_anuncios set ultimo_indice = idx where corretor_id = p_corretor;
      return cand;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.proximo_da_roleta(uuid, uuid[], text) from public;
revoke all on function public.proximo_da_roleta(uuid, uuid[], text) from anon;
revoke all on function public.proximo_da_roleta(uuid, uuid[], text) from authenticated;
grant execute on function public.proximo_da_roleta(uuid, uuid[], text) to service_role;

-- Refaz o aviso do lead para o dono de AGORA. Quem chama é o servidor, depois
-- da roleta; o gatilho da 0215 segue cobrindo o lead que nasce com dono.
create or replace function public.enfileirar_aviso_do_lead(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead      record;
  v_instancia text;
  v_jid       text;
  v_nome      text;
begin
  select l.id, l.grupo_id, l.corretor_id, l.trazido_por
    into v_lead
    from public.leads l
   where l.id = p_lead;

  if not found or v_lead.corretor_id is null then
    return;
  end if;

  -- Lead do impulsionamento do próprio corretor não é "lead distribuído".
  if v_lead.trazido_por = 'corretor' then
    return;
  end if;

  select g.envio_grupo_leads_instancia, c.whatsapp_grupo_leads_jid, c.whatsapp_grupo_leads_nome
    into v_instancia, v_jid, v_nome
    from public.grupos g
    join public.corretores c on c.id = v_lead.corretor_id and c.grupo_id = g.id
   where g.id = v_lead.grupo_id
     and g.envio_grupo_leads_ativo
     and g.envio_grupo_leads_instancia is not null
     and c.ativo
     and not c.oculta
     and c.whatsapp_grupo_leads_jid is not null;

  if v_instancia is null or v_jid is null then
    return;
  end if;

  -- Só reaponta aviso que ainda não saiu (ou que falhou). Enviado/enviando/
  -- cancelado ficam como estão: não reabre o que já foi feito.
  insert into public.lead_envios_grupo (grupo_id, lead_id, corretor_id, instance_name, grupo_jid, grupo_nome)
  values (v_lead.grupo_id, v_lead.id, v_lead.corretor_id, v_instancia, v_jid, v_nome)
  on conflict (lead_id) do update
    set corretor_id = excluded.corretor_id,
        instance_name = excluded.instance_name,
        grupo_jid = excluded.grupo_jid,
        grupo_nome = excluded.grupo_nome,
        status = 'pendente',
        tentativas = 0,
        ultimo_erro = null,
        proxima_tentativa_em = now(),
        updated_at = now()
    where public.lead_envios_grupo.status in ('pendente', 'erro');
end;
$$;

revoke all on function public.enfileirar_aviso_do_lead(uuid) from public;
revoke all on function public.enfileirar_aviso_do_lead(uuid) from anon;
revoke all on function public.enfileirar_aviso_do_lead(uuid) from authenticated;
grant execute on function public.enfileirar_aviso_do_lead(uuid) to service_role;

commit;
