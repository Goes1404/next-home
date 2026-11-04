-- 0259 · Índices nas chaves estrangeiras sem índice (04/11/2026)
--
-- AINDA NÃO APLICADA em produção: aguarda a confirmação do dono (o `drop
-- policy` pede confirmação no Supabase). Fica fora da main até lá.
--
-- O advisor de desempenho do Supabase listou 32 chaves estrangeiras sem
-- índice. Sem ele, todo `delete`/`update` na tabela-mãe (apagar um corretor,
-- um grupo, um lead) varre a tabela-filha inteira para conferir a FK, e os
-- filtros por essas colunas (`grupo_id`, `corretor_id`) também varrem.
-- As tabelas são pequenas hoje (a maior, `cliques_whatsapp`, ~2 MB): os
-- índices nascem em segundos. Só índices novos; nada muda de dado, policy,
-- view ou função.
--
-- 0257 e 0258 estão reservadas: a 0257 (configurar_disparo condicional) e a
-- 0258 do número oficial do WhatsApp (ver RESERVADOS em src/lib/migrations.test.ts).
--
-- Transação e lock_timeout pela régua de `migracoesAtomicas.test.ts`.
begin;
set local lock_timeout = '5s';

create index if not exists aceites_do_termo_de_adesao_corretor_id_idx on public.aceites_do_termo_de_adesao (corretor_id);
create index if not exists admin_eventos_ator_plataforma_user_id_idx on public.admin_eventos (ator_plataforma_user_id);
create index if not exists agenda_mensagens_tratadas_grupo_id_idx on public.agenda_mensagens_tratadas (grupo_id);
create index if not exists avisos_aos_clientes_criado_por_idx on public.avisos_aos_clientes (criado_por);
create index if not exists avisos_de_match_corretor_id_idx on public.avisos_de_match (corretor_id);
create index if not exists avisos_de_match_grupo_id_idx on public.avisos_de_match (grupo_id);
create index if not exists central_escolha_de_grupo_corretor_id_idx on public.central_escolha_de_grupo (corretor_id);
create index if not exists central_estado_grupo_id_idx on public.central_estado (grupo_id);
create index if not exists cliques_whatsapp_lead_id_idx on public.cliques_whatsapp (lead_id);
create index if not exists compromisso_participantes_grupo_id_idx on public.compromisso_participantes (grupo_id);
create index if not exists compromissos_criado_por_idx on public.compromissos (criado_por);
create index if not exists conversa_de_agenda_grupo_id_idx on public.conversa_de_agenda (grupo_id);
create index if not exists creditos_de_indicacao_pagamento_id_idx on public.creditos_de_indicacao (pagamento_id);
create index if not exists grupos_criado_por_idx on public.grupos (criado_por);
create index if not exists ia_consumo_corretor_id_idx on public.ia_consumo (corretor_id);
create index if not exists indicacoes_pedido_id_idx on public.indicacoes (pedido_id);
create index if not exists inscricoes_push_grupo_id_idx on public.inscricoes_push (grupo_id);
create index if not exists lead_documentos_lista_corretor_id_idx on public.lead_documentos_lista (corretor_id);
create index if not exists lead_envios_grupo_corretor_id_idx on public.lead_envios_grupo (corretor_id);
create index if not exists lead_envios_grupo_grupo_id_idx on public.lead_envios_grupo (grupo_id);
create index if not exists leads_anuncio_pago_por_idx on public.leads (anuncio_pago_por);
create index if not exists listas_de_retorno_enviadas_grupo_id_idx on public.listas_de_retorno_enviadas (grupo_id);
create index if not exists pedidos_de_contratacao_grupo_criado_id_idx on public.pedidos_de_contratacao (grupo_criado_id);
create index if not exists portais_recebimentos_grupo_id_idx on public.portais_recebimentos (grupo_id);
create index if not exists porteiro_barrados_clique_id_idx on public.porteiro_barrados (clique_id);
create index if not exists porteiro_barrados_empreendimento_id_idx on public.porteiro_barrados (empreendimento_id);
create index if not exists retornos_de_ligacao_corrige_id_idx on public.retornos_de_ligacao (corrige_id);
create index if not exists roleta_anuncios_atualizado_por_idx on public.roleta_anuncios (atualizado_por);
create index if not exists roleta_anuncios_grupo_id_idx on public.roleta_anuncios (grupo_id);
create index if not exists vitrine_visualizacoes_corretor_id_idx on public.vitrine_visualizacoes (corretor_id);
create index if not exists vitrine_visualizacoes_empreendimento_id_idx on public.vitrine_visualizacoes (empreendimento_id);
create index if not exists vitrine_visualizacoes_grupo_id_idx on public.vitrine_visualizacoes (grupo_id);

-- `lead_observacoes_ia` tinha DUAS policies que liberam o mesmo SELECT com a
-- MESMA condição: "Corretores atualizam dossie de seus leads" (FOR ALL) já
-- cobre tudo o que "Corretores leem dossie de seus leads" (FOR SELECT)
-- libera, letra a letra. A de leitura sobrava e custava uma avaliação a mais
-- por linha lida. As outras policies repetidas apontadas pelo advisor
-- (whatsapp_campanhas_fila, whatsapp_mensagens e as públicas de catálogo)
-- NÃO são iguais entre si (o gestor, a escrita e o anônimo mudam) e ficam.
drop policy if exists "Corretores leem dossie de seus leads" on public.lead_observacoes_ia;

commit;
