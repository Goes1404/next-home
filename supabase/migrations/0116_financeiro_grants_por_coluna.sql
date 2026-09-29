-- 0116 — O grant por coluna da 0114/0115 não valia (26/09/2026).
--
-- A 0114 garantia "o corretor não marca a própria comissão como recebida"
-- concedendo UPDATE só em algumas colunas de `vendas`. Só que o Supabase dá
-- ao `authenticated`, por privilégio padrão, ALL na tabela inteira em toda
-- tabela nova do `public` — e grant de TABELA vale para todas as colunas,
-- por cima de qualquer grant de coluna. A 0114 só revogou o `anon`.
--
-- Medido depois de aplicar: has_column_privilege('authenticated',
-- 'public.vendas', 'comissao_recebida_em', 'UPDATE') = true. Pela API, um
-- corretor conseguia marcar a comissão recebida (e o repasse pago, em
-- `venda_participantes`) — a policy de UPDATE libera a LINHA, e só o grant
-- distingue colunas.
--
-- Havia um segundo caminho igual: INSERT também era de tabela, então dava
-- para CRIAR a venda já marcada como recebida. Por isso o insert também
-- passa a ser por coluna — exatamente as que `salvar_venda` grava.
--
-- `leads`, `corretores` e `catalogo_candidatos` já faziam o revoke antes do
-- grant por coluna; estas três eram as únicas sem. `tabelasSeguras.test.ts`
-- passou a cobrar isso.

revoke all on public.vendas from authenticated;
grant select, delete on public.vendas to authenticated;
grant insert (
  corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda,
  valor_venda, comissao_percentual, comissao_valor, status, distratada_em, observacao
) on public.vendas to authenticated;
grant update (
  lead_id, empreendimento_id, imovel_descricao, unidade, data_venda, valor_venda,
  comissao_percentual, comissao_valor, status, distratada_em, observacao, atualizado_em
) on public.vendas to authenticated;

revoke all on public.venda_participantes from authenticated;
grant select, delete on public.venda_participantes to authenticated;
grant insert (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor)
  on public.venda_participantes to authenticated;
grant update (parte_percentual, repasse_percentual, repasse_valor)
  on public.venda_participantes to authenticated;

revoke all on public.metas_corretor from authenticated;
grant select on public.metas_corretor to authenticated;
grant insert (corretor_id, mes, meta_comissao, comissao_por_venda, atualizado_em)
  on public.metas_corretor to authenticated;
grant update (meta_comissao, comissao_por_venda, atualizado_em)
  on public.metas_corretor to authenticated;

-- Conferência (deve dar false, false, false, true):
--   select
--     has_column_privilege('authenticated','public.vendas','comissao_recebida_em','UPDATE'),
--     has_column_privilege('authenticated','public.vendas','comissao_recebida_em','INSERT'),
--     has_column_privilege('authenticated','public.venda_participantes','repasse_pago_em','UPDATE'),
--     has_column_privilege('authenticated','public.vendas','valor_venda','UPDATE');
