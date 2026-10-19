-- 0170 — O ranking do perfil de demonstração (07/10/2026).
--
-- O perfil demo (scripts/demo/semearPerfilDemo.sql) é um corretor
-- DESATIVADO, para ficar fora da roleta e do site. Como `ranking_vgv` só
-- lista quem está ativo, ele nem aparecia no próprio ranking.
--
-- A regra passa a ser por grupo: quem está ativo vê os ativos (nada muda
-- para a equipe real); quem está desativado vê os desativados com slug —
-- na prática, o time de demonstração. Assim o ranking do demo tem colegas
-- fictícios, e nenhum deles chega à tela de quem trabalha de verdade.
-- Desativado sem slug ("Equipe Next Home") continua fora.

create or replace function public.ranking_vgv(p_inicio date, p_fim date)
returns table (
  corretor_id uuid,
  nome text,
  foto_url text,
  vgv numeric,
  vendas bigint,
  distratos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu_ativo boolean;
begin
  if public.corretor_atual() is null then
    raise exception 'sem_sessao';
  end if;

  select c.ativo into v_eu_ativo from public.corretores c where c.id = public.corretor_atual();

  return query
  select
    c.id,
    c.nome,
    c.foto_url,
    coalesce(sum(v.valor_venda * p.parte_percentual / 100)
      filter (where v.status = 'ativa' and v.data_venda between p_inicio and p_fim), 0)::numeric(16, 2),
    count(v.id) filter (where v.status = 'ativa' and v.data_venda between p_inicio and p_fim),
    count(v.id) filter (where v.status = 'distratada' and v.distratada_em between p_inicio and p_fim)
  from public.corretores c
  left join public.venda_participantes p on p.corretor_id = c.id
  left join public.vendas v on v.id = p.venda_id
  where (coalesce(v_eu_ativo, true) and c.ativo)
     or (not coalesce(v_eu_ativo, true) and not c.ativo and c.slug is not null)
  group by c.id, c.nome, c.foto_url
  order by 4 desc, 5 desc, c.nome;
end;
$$;

revoke all on function public.ranking_vgv(date, date) from public, anon;
grant execute on function public.ranking_vgv(date, date) to authenticated;
