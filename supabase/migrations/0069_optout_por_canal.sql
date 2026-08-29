-- V1.1: alteração auditável de preferência por canal.

create or replace function public.definir_preferencia_contato(
  p_lead_id uuid,
  p_canal text,
  p_permitido boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_autorizado boolean;
begin
  if p_canal not in ('email', 'whatsapp', 'telefone') then
    raise exception 'canal inválido';
  end if;

  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and (l.corretor_id = public.corretor_atual() or public.eh_gestor())
  ) into v_autorizado;
  if not v_autorizado then return false; end if;

  insert into public.marketing_preferencias (
    lead_id, finalidade, canal, permitido, atualizado_em
  ) values (
    p_lead_id, 'atendimento_solicitado', p_canal, p_permitido, now()
  )
  on conflict (lead_id, finalidade, canal) do update
    set permitido = excluded.permitido, atualizado_em = now();

  insert into public.marketing_consentimentos (
    lead_id, finalidade, canal, estado, base_legal, versao_aviso, origem
  ) values (
    p_lead_id, 'atendimento_solicitado', p_canal,
    case when p_permitido then 'concedido' else 'revogado' end,
    'consentimento', 'preferencia-painel-v1', 'painel_corretor'
  );

  return true;
end;
$$;

revoke all on function public.definir_preferencia_contato(uuid, text, boolean) from public;
grant execute on function public.definir_preferencia_contato(uuid, text, boolean) to authenticated;

comment on function public.definir_preferencia_contato is
  'Atualiza preferência atual e acrescenta concessão/revogação ao histórico na mesma transação.';
