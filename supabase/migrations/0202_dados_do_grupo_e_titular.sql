-- 0202 · dados do grupo e LGPD (operação enxuta, desenho §18 "Operação",
-- respostas 7 e 8 do dono; lacunas L80, L81, L83)
--
-- O que entra, e o que fica para depois, está em
-- docs/superpowers/plans/2026-10-20-fase-op-dados-do-grupo.md.
--
--   1. `grupos.cancelado_em`, `dados_apagados_em` e `exportacao_final_caminho`.
--      Cancelar marca a data e põe o grupo em `encerrado` (o site sai do ar
--      pela 0201); dentro de 90 dias dá para desfazer (resposta 7). A Next
--      Home (grupo 1) não pode ser cancelada: CHECK aqui, não só na tela.
--      Escrita só pela chave de serviço: nenhuma coluna nova ganha grant (a
--      0196 concede ao logado só as colunas básicas, uma a uma).
--   2. `admin_eventos.acao` ganha os eventos novos. Nenhum deles carrega dado
--      pessoal em `detalhes`: contagens, quem agiu e quando.
--   3. Bucket PRIVADO `exportacoes-de-grupos`: a cópia que a rotina dos 90
--      dias grava antes de apagar. Sem policy nenhuma: só a chave de serviço
--      lê e escreve.
--   4. `apagar_dados_do_titular(lead)`: o pedido do titular (LGPD art. 18).
--      Só o gestor do grupo do lead. Apaga o lead E as outras fichas do grupo
--      com o mesmo telefone ou o mesmo e-mail (a pessoa é uma, as fichas
--      podem ser várias: planilha reimportada, dois corretores). O cascade leva conversa,
--      mensagens, documentos registrados, dossiê, tarefas, linha do tempo) e
--      o que as FKs `on delete set null` deixariam para trás: envios antigos,
--      e-mail de portal, itens de lista de transmissão, eventos de marketing,
--      tentativas de ativação, anotações do lead, e a telemetria e as
--      correções da IA das conversas dele. FICAM a venda e o fiscal dela
--      (obrigação legal, LGPD art. 16, I; a venda perde o vínculo com o lead)
--      e o clique do link (sem dado pessoal). Os arquivos do Storage
--      (`documentos-clientes/<lead>/`) quem apaga é o código, depois desta
--      função: SQL não apaga objeto do Storage.
--   5. `apagar_dados_do_grupo(grupo)`: o fim dos 90 dias. Só a chave de
--      serviço. Recusa grupo da Next Home, não cancelado, cancelado há menos
--      de 90 dias, sem a cópia exportada gravada, com lead ou venda criados
--      depois da cópia, ou já apagado. Apaga toda
--      linha com `grupo_id` do grupo em toda tabela do `public` (menos
--      `grupos`, que fica com `dados_apagados_em` para a auditoria), em
--      passadas até as chaves estrangeiras deixarem: a ordem não é escrita à
--      mão, então tabela nova entra sozinha. Tudo ou nada: se alguma tabela
--      não deixa apagar, a transação inteira volta.
--
-- Os logins do Auth e os arquivos PRIVADOS do grupo (`documentos-clientes/
-- <lead>/` e `contabilidade/<grupo>/`) ficam com o código da rotina; a cópia
-- final guardada é apagada pela rotina 30 dias depois dos dados. O Storage
-- público (fotos, artes) e as instâncias da Evolution ficam como pendência:
-- ver o plano.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. As colunas de `grupos`
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists cancelado_em timestamptz,
  add column if not exists dados_apagados_em timestamptz,
  add column if not exists exportacao_final_caminho text,
  add column if not exists exportacao_final_em timestamptz,
  add column if not exists copia_final_apagada_em timestamptz,
  add column if not exists tentativa_de_apagar_em timestamptz,
  add column if not exists falha_ao_apagar text,
  add column if not exists situacao_antes_do_cancelamento text;

alter table public.grupos drop constraint if exists grupos_situacao_antes_do_cancelamento_check;
alter table public.grupos
  add constraint grupos_situacao_antes_do_cancelamento_check
  check (situacao_antes_do_cancelamento is null or situacao_antes_do_cancelamento in ('ativo', 'suspenso', 'encerrado'));

comment on column public.grupos.cancelado_em is
  'Quando o grupo cancelou. Os dados ficam bloqueados por 90 dias e depois são apagados (resposta 7 do dono, 0202).';
comment on column public.grupos.dados_apagados_em is
  'Quando a rotina dos 90 dias apagou os dados do grupo. A linha de grupos fica para a auditoria (0202).';
comment on column public.grupos.exportacao_final_caminho is
  'Caminho, no bucket privado exportacoes-de-grupos, da cópia gravada antes de apagar. Fica nulo quando a cópia é apagada, 30 dias depois dos dados (0202).';
comment on column public.grupos.exportacao_final_em is
  'Quando a cópia final foi gerada. apagar_dados_do_grupo recusa se entrou lead ou venda depois disso (0202).';
comment on column public.grupos.copia_final_apagada_em is
  'Quando a cópia final guardada foi apagada (30 dias depois de dados_apagados_em, 0202).';
comment on column public.grupos.tentativa_de_apagar_em is
  'Última tentativa da rotina dos 90 dias que falhou. A rotina tenta antes quem não falhou há mais tempo (0202).';
comment on column public.grupos.falha_ao_apagar is
  'Motivo da última falha da rotina dos 90 dias, sem dado pessoal; nulo depois de apagar (0202).';
comment on column public.grupos.situacao_antes_do_cancelamento is
  'A situação do grupo antes do cancelamento; desfazer volta a ela (0202).';

alter table public.grupos drop constraint if exists grupos_next_home_nao_cancela;
alter table public.grupos
  add constraint grupos_next_home_nao_cancela
  check (id <> '00000000-0000-0000-0000-000000000001' or (cancelado_em is null and dados_apagados_em is null));

-- Repetido para a migration não depender da 0196: coluna nova herda o grant
-- de TABELA, e o logado não tem nenhum (só colunas, uma a uma).
revoke all on public.grupos from anon;
revoke insert, update, delete, truncate, references, trigger on public.grupos from authenticated;

-- ---------------------------------------------------------------------------
-- 2. `admin_eventos.acao`
-- ---------------------------------------------------------------------------

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (acao in (
  'conta_criada', 'senha_redefinida', 'papel_alterado', 'corretor_desativado', 'corretor_reativado',
  'leads_redistribuidos', 'numero_desconectado', 'grupo_criado', 'grupo_desfeito', 'convite_enviado',
  'convite_reenviado', 'email_alterado', 'link_de_senha_enviado', 'link_de_senha_pedido',
  'cota_da_ia_ajustada', 'identidade_da_ia_alterada', 'fichas_exportadas',
  'dados_do_grupo_exportados', 'titular_apagado', 'grupo_cancelado', 'cancelamento_desfeito',
  'dados_do_grupo_apagados', 'falha_ao_apagar_dados_do_grupo', 'copia_final_baixada', 'copia_final_apagada'
));

-- ---------------------------------------------------------------------------
-- 3. O bucket privado da cópia final
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('exportacoes-de-grupos', 'exportacoes-de-grupos', false, 52428800)
on conflict (id) do nothing;

update storage.buckets set public = false where id = 'exportacoes-de-grupos';

-- ---------------------------------------------------------------------------
-- 4. O pedido do titular
-- ---------------------------------------------------------------------------

drop function if exists public.apagar_dados_do_titular(uuid);
create function public.apagar_dados_do_titular(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ator uuid := public.corretor_atual();
  v_grupo uuid := public.grupo_atual();
  v_lead_grupo uuid;
  v_telefone text;
  v_email text;
  v_leads uuid[];
  v_conversas uuid[];
  v_n integer;
  v_apagados jsonb := '{}'::jsonb;
begin
  if v_ator is null or v_grupo is null or not public.eh_gestor() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select l.grupo_id, nullif(btrim(l.telefone_e164), ''), nullif(lower(btrim(l.email)), '')
    into v_lead_grupo, v_telefone, v_email
    from leads l
   where l.id = p_lead
   for update;
  if not found or v_lead_grupo is distinct from v_grupo then
    raise exception 'lead_nao_encontrado' using errcode = 'P0002';
  end if;

  -- A mesma pessoa costuma ter mais de uma ficha no grupo (planilha
  -- reimportada, dois corretores com o mesmo número). O pedido é DELA, não
  -- da ficha: vão todas as do grupo com o mesmo telefone ou o mesmo e-mail.
  select coalesce(array_agg(l.id order by l.id), '{}') into v_leads
    from (
      select l.id
        from leads l
       where l.grupo_id = v_grupo
         and (l.id = p_lead
              or (v_telefone is not null and l.telefone_e164 = v_telefone)
              or (v_email is not null and lower(btrim(l.email)) = v_email))
       for update
    ) l;

  select coalesce(array_agg(c.id), '{}') into v_conversas
    from whatsapp_conversas c
   where c.lead_id = any (v_leads) and c.grupo_id = v_grupo;

  delete from ia_correcoes where conversa_id = any (v_conversas) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('ia_correcoes', v_n);

  delete from ia_interacoes where conversa_id = any (v_conversas) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('ia_interacoes', v_n);

  delete from historico_envios where lead_id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('historico_envios', v_n);

  delete from inbound_logs where lead_id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('inbound_logs', v_n);

  delete from whatsapp_campanhas_fila where lead_id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('whatsapp_campanhas_fila', v_n);

  delete from marketing_eventos where lead_id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('marketing_eventos', v_n);

  delete from ativacoes_em_lead_alheio where lead_id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('ativacoes_em_lead_alheio', v_n);

  delete from anotacoes where lead_id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados || jsonb_build_object('anotacoes', v_n);

  delete from leads where id = any (v_leads) and grupo_id = v_grupo;
  get diagnostics v_n = row_count;
  v_apagados := v_apagados
    || jsonb_build_object('fichas', v_n)
    || jsonb_build_object('conversas', cardinality(v_conversas));

  -- Sem nome, telefone nem id do lead: o registro prova que o pedido foi
  -- atendido (quem, quando, quanto), e nada aponta de volta para a pessoa.
  insert into admin_eventos (grupo_id, ator_id, acao, alvo_corretor_id, detalhes)
  values (v_grupo, v_ator, 'titular_apagado', null, jsonb_build_object('apagados', v_apagados));

  -- Os ids voltam só para quem pediu (o gestor do grupo): é com eles que o
  -- código apaga as pastas `documentos-clientes/<lead>/`. Não vão ao evento.
  return jsonb_build_object('apagados', v_apagados, 'leads', to_jsonb(v_leads));
end;
$$;

comment on function public.apagar_dados_do_titular(uuid) is
  'Pedido do titular (LGPD art. 18): só o gestor do grupo do lead. Apaga o lead, as outras fichas do grupo com o mesmo telefone ou e-mail e as sobras delas; a venda fica (0202).';

revoke all on function public.apagar_dados_do_titular(uuid) from public, anon;
grant execute on function public.apagar_dados_do_titular(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. O fim dos 90 dias
-- ---------------------------------------------------------------------------

drop function if exists public.apagar_dados_do_grupo(uuid);
create function public.apagar_dados_do_grupo(p_grupo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo record;
  v_tabela text;
  v_n bigint;
  v_total bigint := 0;
  v_pendentes integer;
  v_progresso boolean;
  v_ultima text;
  v_ultimo_erro text;
  v_tabelas jsonb := '{}'::jsonb;
begin
  if p_grupo = '00000000-0000-0000-0000-000000000001' then
    raise exception 'grupo_protegido' using errcode = '42501';
  end if;

  select g.id, g.cancelado_em, g.dados_apagados_em, g.exportacao_final_caminho, g.exportacao_final_em
    into v_grupo
    from grupos g
   where g.id = p_grupo
   for update;
  if not found then
    raise exception 'grupo_nao_encontrado' using errcode = 'P0002';
  end if;
  if v_grupo.dados_apagados_em is not null then
    raise exception 'ja_apagado' using errcode = '22023';
  end if;
  if v_grupo.cancelado_em is null or v_grupo.cancelado_em > now() - interval '90 days' then
    raise exception 'prazo_nao_venceu' using errcode = '22023';
  end if;
  if v_grupo.exportacao_final_caminho is null or v_grupo.exportacao_final_em is null then
    raise exception 'sem_copia' using errcode = '22023';
  end if;
  -- O grupo cancelado continua recebendo (webhook, formulário, listas): o que
  -- entrou depois da cópia não está nela. Apagar agora sumiria com isso sem
  -- entrega; a rotina gera outra cópia no próximo tique.
  if exists (select 1 from leads where grupo_id = p_grupo and created_at > v_grupo.exportacao_final_em)
     or exists (select 1 from vendas where grupo_id = p_grupo and created_at > v_grupo.exportacao_final_em) then
    raise exception 'entrou_dado_depois_da_copia' using errcode = '22023';
  end if;

  -- Passadas até toda tabela do grupo ficar vazia. Uma tabela que ainda tem
  -- filha esperando falha com foreign_key_violation e fica para a próxima
  -- passada; passada sem progresso nenhum é recusa (a transação volta).
  loop
    v_pendentes := 0;
    v_progresso := false;
    for v_tabela in
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and c.relname <> 'grupos'
       order by c.relname
    loop
      begin
        execute format('delete from public.%I where grupo_id = $1', v_tabela) using p_grupo;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_progresso := true;
          v_total := v_total + v_n;
          v_tabelas := v_tabelas
            || jsonb_build_object(v_tabela, coalesce((v_tabelas ->> v_tabela)::bigint, 0) + v_n);
        end if;
      exception when foreign_key_violation then
        v_pendentes := v_pendentes + 1;
        v_ultima := v_tabela;
        v_ultimo_erro := sqlerrm;
      end;
    end loop;
    exit when v_pendentes = 0;
    if not v_progresso then
      raise exception 'nao_consegui_apagar % (%)', v_ultima, v_ultimo_erro using errcode = '23503';
    end if;
  end loop;

  update grupos
     set dados_apagados_em = now(),
         situacao = 'encerrado',
         tentativa_de_apagar_em = null,
         falha_ao_apagar = null
   where id = p_grupo;

  return jsonb_build_object('linhas', v_total, 'tabelas', v_tabelas);
end;
$$;

comment on function public.apagar_dados_do_grupo(uuid) is
  'Apaga as linhas de um grupo cancelado há 90+ dias, com a cópia já gravada. Só a chave de serviço (0202).';

revoke all on function public.apagar_dados_do_grupo(uuid) from public, anon, authenticated;
grant execute on function public.apagar_dados_do_grupo(uuid) to service_role;

commit;
