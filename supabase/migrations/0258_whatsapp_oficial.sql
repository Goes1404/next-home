-- 0258: lista de transmissão pela API oficial da Meta (03/11/2026).
--
-- Roadmap: docs/ROADMAP-WHATSAPP-OFICIAL.md. A lista fria passa a poder sair
-- por um número OFICIAL da imobiliária (WhatsApp Cloud API), com modelo
-- aprovado pela Meta, em vez do WhatsApp pessoal do corretor na Evolution —
-- o que restringiu a conta da Bruna em 07/10/2026.
--
-- Número: nasceu 0254 na branch `ccr-7424dca4-4nynlp` e virou 0255 no mesmo
-- dia, quando a prospecção chegou à main com a 0253 e a 0254
-- (`0254_equipe_da_prospeccao.sql`). Em 04/11/2026 virou 0256, 0257 e, por
-- fim, 0258: a main publicou e aplicou em produção a
-- `0255_disparo_so_com_campanha_ativa.sql` (o tique das campanhas só chama a
-- Vercel com lista em andamento) e a `0256_followup_da_prospeccao.sql`, e a
-- 0257 ficou com a correção da `configurar_disparo_automatico`.
--
-- O que esta migration faz:
--   1. `whatsapp_numeros_oficiais`: o número oficial de cada grupo (um ativo
--      por grupo) e o que o gestor decide sobre ele (quem pode usar, teto do
--      mês, quem responde). O token do cliente (Embedded Signup, F5) mora
--      CIFRADO aqui; no piloto da Next Home ele vem da variável de ambiente.
--   2. `whatsapp_modelos_oficiais`: os modelos (templates) que a Meta aprova.
--   3. `whatsapp_campanhas` ganha o canal (`evolution` | `oficial`), o número
--      e o modelo; `whatsapp_campanhas_fila`, o id da mensagem na Meta
--      (`wamid`), entrega, leitura, erro e a cobrança que a Meta informa.
--   4. `whatsapp_oficial_conversas` e `whatsapp_oficial_mensagens`: a conversa
--      no número oficial, SEPARADA da do corretor. A conversa do corretor é
--      por (corretor, telefone); misturar as duas juntaria dois números numa
--      linha só, e a IA responderia pelo número errado.
--   5. `whatsapp_oficial_eventos`: o que a Meta mandou ao webhook, cru, para
--      diagnóstico (só de número conhecido; 30 dias).
--   6. `registrar_consentimento_marketing_whatsapp`: concessão e revogação de
--      marketing no WhatsApp no histórico que já existe (0067), na mesma
--      transação. Só a chave de serviço chama: quem pode decide o servidor.
--   7. Os gatilhos de grupo (`carimbar_grupo`, 0191) refeitos para as tabelas
--      tocadas, com as mães novas. É o que faz o BANCO recusar uma lista que
--      aponte para o número ou o modelo de outro grupo, mesmo por uma chamada
--      direta à API com a sessão do corretor.
--   8. `contar_uso_de_recurso` (0214) deixa de somar a mensagem de lista
--      OFICIAL na cota do plano (`uso_da_ia.mensagens_lista`). A cota existe
--      pelo custo da plataforma por mensagem (IA que reescreve, número do
--      corretor); a mensagem oficial é um modelo fixo que a imobiliária paga à
--      Meta. Sem isto, uma lista oficial de 2.000 esgotaria a cota do mês e
--      travaria as listas pelo número dos corretores.
--
-- Como as outras tabelas novas (0224), as cinco tabelas novas são só do
-- servidor: nenhum grant a `anon` nem a `authenticated`. O gestor NUNCA lê
-- conversa (0134): a tela dele lê contagens pela chave de serviço, filtrando
-- o grupo; a conversa oficial aparece só ao corretor dono do lead.
--
-- Código no ar sem esta migration não quebra: a seleção de campanhas do
-- disparador cai no comportamento antigo quando `canal` não existe (42703),
-- e tudo do número oficial fica desligado sem a tabela.
--
-- Transação única, reaplicável (`if not exists`, `drop ... if exists`).

begin;

-- `whatsapp_campanhas` é lida pelo disparador a cada minuto: um ALTER sem
-- teto enfileiraria a fila atrás dele. Com o teto, falha e repete.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. O número oficial do grupo
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_numeros_oficiais (
  id                        uuid primary key default gen_random_uuid(),
  grupo_id                  uuid not null references public.grupos(id) on delete cascade,
  -- Conta do WhatsApp Business (WABA) e o id do número na Cloud API.
  waba_id                   text not null,
  phone_number_id           text not null,
  numero                    text,
  nome_exibicao             text,
  estado                    text not null default 'ativo'
                            check (estado in ('ativo', 'pausado', 'desligado')),
  -- Por que pausou (qualidade, conta restrita, pagamento): a tela mostra.
  motivo_estado             text,
  -- O que a Meta informa: limite de envio (TIER_250, TIER_2K, ...) e
  -- qualidade (GREEN, YELLOW, RED, UNKNOWN).
  limite_de_envio           text,
  qualidade                 text,
  atualizado_na_meta_em     timestamptz,
  -- Decisões do gestor.
  liberado_para_corretores  boolean not null default false,
  teto_mensal               integer check (teto_mensal is null or teto_mensal >= 0),
  resposta                  text not null default 'ia'
                            check (resposta in ('ia', 'mensagem_fixa', 'nenhuma')),
  mensagem_fixa             text check (mensagem_fixa is null or char_length(mensagem_fixa) <= 1000),
  -- Token do cliente, cifrado pelo servidor (AES-256-GCM). Nulo = a variável
  -- de ambiente do piloto (`WHATSAPP_OFICIAL_TOKEN`).
  token_cifrado             text,
  origem                    text not null default 'manual'
                            check (origem in ('manual', 'embedded_signup')),
  conectado_por             uuid references public.corretores(id) on delete set null,
  created_at                timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),
  constraint whatsapp_numeros_oficiais_phone_unico unique (phone_number_id)
);

comment on table public.whatsapp_numeros_oficiais is
  'Número oficial (WhatsApp Cloud API) de um grupo e as decisões do gestor sobre ele (0258). Só o servidor lê e grava.';
comment on column public.whatsapp_numeros_oficiais.token_cifrado is
  'Token do cliente (Embedded Signup), cifrado com WHATSAPP_OFICIAL_CHAVE_CIFRA. Nulo no piloto: vale WHATSAPP_OFICIAL_TOKEN.';
comment on column public.whatsapp_numeros_oficiais.teto_mensal is
  'Máximo de mensagens de lista pelo número oficial no mês (todas cobradas pela Meta). Nulo = sem teto.';

-- Um número ativo por grupo (decisão de 03/11/2026: um número oficial por
-- imobiliária no piloto; o limite de envio da Meta é do portfólio inteiro de
-- qualquer jeito).
create unique index if not exists whatsapp_numeros_oficiais_um_por_grupo
  on public.whatsapp_numeros_oficiais (grupo_id)
  where estado <> 'desligado';

-- ---------------------------------------------------------------------------
-- 2. Os modelos aprovados pela Meta
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_modelos_oficiais (
  id                    uuid primary key default gen_random_uuid(),
  grupo_id              uuid not null references public.grupos(id) on delete cascade,
  numero_oficial_id     uuid not null references public.whatsapp_numeros_oficiais(id) on delete cascade,
  -- Regra da Meta: minúsculas, números e sublinhado, até 512. O tamanho vai
  -- à parte: o Postgres recusa repetição acima de 255 na regex ("invalid
  -- repetition count"), e `{1,512}` faria TODO insert falhar.
  nome                  text not null check (nome ~ '^[a-z0-9_]+$' and char_length(nome) <= 512),
  idioma                text not null default 'pt_BR',
  categoria             text not null default 'MARKETING' check (categoria in ('MARKETING', 'UTILITY')),
  -- Texto com variáveis nomeadas ({{nome}}, {{imovel}}, ...).
  corpo                 text not null check (char_length(corpo) between 1 and 1024),
  -- Valor de exemplo de cada variável, que a Meta exige para aprovar.
  exemplos              jsonb not null default '{}'::jsonb,
  cabecalho             text not null default 'nenhum' check (cabecalho in ('nenhum', 'imagem', 'texto')),
  cabecalho_texto       text check (cabecalho_texto is null or char_length(cabecalho_texto) <= 60),
  -- Foto de exemplo na aprovação; no envio, a foto do imóvel da lista.
  cabecalho_imagem_url  text,
  rodape                text check (rodape is null or char_length(rodape) <= 60),
  -- [{"tipo": "interesse" | "parar", "texto": "..."}]
  botoes                jsonb not null default '[]'::jsonb,
  meta_id               text,
  estado                text not null default 'rascunho'
                        check (estado in ('rascunho', 'em_analise', 'aprovado', 'rejeitado', 'pausado', 'desativado', 'erro')),
  motivo                text,
  qualidade             text,
  criado_por            uuid references public.corretores(id) on delete set null,
  enviado_em            timestamptz,
  created_at            timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  constraint whatsapp_modelos_oficiais_nome_unico unique (numero_oficial_id, nome, idioma)
);

comment on table public.whatsapp_modelos_oficiais is
  'Modelos (templates) do número oficial, com o estado da aprovação na Meta (0258). Só o servidor lê e grava.';

create index if not exists whatsapp_modelos_oficiais_grupo_estado_idx
  on public.whatsapp_modelos_oficiais (grupo_id, estado);
create index if not exists whatsapp_modelos_oficiais_meta_idx
  on public.whatsapp_modelos_oficiais (meta_id)
  where meta_id is not null;

-- ---------------------------------------------------------------------------
-- 3. A lista ganha o canal; a fila, o rastro da Meta
-- ---------------------------------------------------------------------------

alter table public.whatsapp_campanhas
  add column if not exists canal text not null default 'evolution',
  add column if not exists numero_oficial_id uuid
    references public.whatsapp_numeros_oficiais(id) on delete restrict,
  add column if not exists modelo_oficial_id uuid
    references public.whatsapp_modelos_oficiais(id) on delete restrict;

comment on column public.whatsapp_campanhas.canal is
  'Por onde a lista sai: evolution (WhatsApp do corretor) ou oficial (número oficial do grupo, com modelo aprovado). 0258.';

alter table public.whatsapp_campanhas
  drop constraint if exists whatsapp_campanhas_canal_valido;
alter table public.whatsapp_campanhas
  add constraint whatsapp_campanhas_canal_valido check (
    (canal = 'evolution' and numero_oficial_id is null and modelo_oficial_id is null)
    or (
      canal = 'oficial'
      and numero_oficial_id is not null
      and (modelo_oficial_id is not null or status = 'rascunho')
    )
  );

create index if not exists whatsapp_campanhas_oficiais_em_andamento_idx
  on public.whatsapp_campanhas (numero_oficial_id, status)
  where canal = 'oficial';

alter table public.whatsapp_campanhas_fila
  add column if not exists wamid text,
  add column if not exists entregue_em timestamptz,
  add column if not exists lido_em timestamptz,
  add column if not exists erro_meta_codigo integer,
  add column if not exists cobranca_categoria text,
  add column if not exists cobrada boolean;

comment on column public.whatsapp_campanhas_fila.wamid is
  'Id da mensagem na Meta (lista pelo número oficial, 0258). É por ele que o status do webhook acha o item.';

-- Único dentro do grupo (a régua de `isolamento.db.test.ts`: chave única de
-- tabela com grupo inclui o grupo). O wamid já é único na Meta inteira.
create unique index if not exists whatsapp_campanhas_fila_wamid_idx
  on public.whatsapp_campanhas_fila (grupo_id, wamid)
  where wamid is not null;

-- ---------------------------------------------------------------------------
-- 4. A conversa no número oficial
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_oficial_conversas (
  id                    uuid primary key default gen_random_uuid(),
  grupo_id              uuid not null references public.grupos(id) on delete cascade,
  numero_oficial_id     uuid not null references public.whatsapp_numeros_oficiais(id) on delete cascade,
  -- Só dígitos, com DDI: o `wa_id` da Meta.
  telefone              text not null check (telefone ~ '^[0-9]{8,15}$'),
  lead_id               uuid references public.leads(id) on delete set null,
  -- O dono do lead quando a conversa foi vista por último: é quem lê e quem
  -- é avisado. O gestor não lê (0134).
  corretor_id           uuid references public.corretores(id) on delete set null,
  nome_cliente          text,
  -- Fim da janela de 24 h aberta pela última fala do cliente: depois dela,
  -- só modelo aprovado sai.
  janela_ate            timestamptz,
  ultima_mensagem       text,
  ultima_interacao_em   timestamptz not null default now(),
  ia_ativa              boolean not null default true,
  assumida_em           timestamptz,
  assumida_por          uuid references public.corretores(id) on delete set null,
  avisado_em            timestamptz,
  created_at            timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  constraint whatsapp_oficial_conversas_unica unique (numero_oficial_id, telefone)
);

comment on table public.whatsapp_oficial_conversas is
  'Conversa de um cliente com o número oficial do grupo (0258). Separada de whatsapp_conversas, que é do número do corretor. Só o servidor lê e grava; a tela mostra só ao dono do lead.';

create index if not exists whatsapp_oficial_conversas_lead_idx
  on public.whatsapp_oficial_conversas (lead_id);
create index if not exists whatsapp_oficial_conversas_corretor_idx
  on public.whatsapp_oficial_conversas (corretor_id, ultima_interacao_em desc);

create table if not exists public.whatsapp_oficial_mensagens (
  id                  uuid primary key default gen_random_uuid(),
  grupo_id            uuid not null references public.grupos(id) on delete cascade,
  conversa_id         uuid not null references public.whatsapp_oficial_conversas(id) on delete cascade,
  remetente           text not null check (remetente in ('cliente', 'bot', 'corretor', 'sistema')),
  tipo                text not null default 'texto'
                      check (tipo in ('texto', 'modelo', 'imagem', 'audio', 'video', 'documento', 'botao', 'outro')),
  conteudo            text not null default '',
  wamid               text,
  status_entrega      text check (status_entrega in ('enviada', 'entregue', 'lida', 'falhou')),
  erro_codigo         integer,
  erro_detalhe        text,
  fila_id             uuid references public.whatsapp_campanhas_fila(id) on delete set null,
  cobranca_categoria  text,
  cobrada             boolean,
  created_at          timestamptz not null default now()
);

comment on table public.whatsapp_oficial_mensagens is
  'Mensagens da conversa no número oficial (0258). Só o servidor lê e grava.';

create unique index if not exists whatsapp_oficial_mensagens_wamid_idx
  on public.whatsapp_oficial_mensagens (grupo_id, wamid)
  where wamid is not null;
create index if not exists whatsapp_oficial_mensagens_conversa_idx
  on public.whatsapp_oficial_mensagens (conversa_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. O que a Meta mandou ao webhook
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_oficial_eventos (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid not null references public.grupos(id) on delete cascade,
  phone_number_id  text,
  campo            text not null,
  payload          jsonb not null,
  processado_em    timestamptz,
  erro             text,
  created_at       timestamptz not null default now()
);

comment on table public.whatsapp_oficial_eventos is
  'Eventos crus do webhook da API oficial, de número conhecido, para diagnóstico (0258). Apagados depois de 30 dias pelo disparador.';

create index if not exists whatsapp_oficial_eventos_criado_idx
  on public.whatsapp_oficial_eventos (created_at);

-- ---------------------------------------------------------------------------
-- 6. Consentimento de marketing no WhatsApp
-- ---------------------------------------------------------------------------
--
-- Mesma forma de `definir_preferencia_contato` (0069): a preferência atual e
-- a linha do histórico na mesma transação. Finalidade `marketing`, canal
-- `whatsapp`. Sem checagem de sessão aqui de propósito: quem chama é o
-- servidor (painel, depois de conferir que o lead é do corretor; webhook,
-- quando o cliente toca "Parar de receber").

create or replace function public.registrar_consentimento_marketing_whatsapp(
  p_lead_id uuid,
  p_concedido boolean,
  p_origem text,
  p_versao text default 'whatsapp-oficial-2026-11'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.marketing_preferencias (lead_id, finalidade, canal, permitido, atualizado_em)
  values (p_lead_id, 'marketing', 'whatsapp', p_concedido, now())
  on conflict (lead_id, finalidade, canal) do update
    set permitido = excluded.permitido, atualizado_em = now();

  insert into public.marketing_consentimentos (
    lead_id, finalidade, canal, estado, base_legal, versao_aviso, origem
  ) values (
    p_lead_id, 'marketing', 'whatsapp',
    case when p_concedido then 'concedido' else 'revogado' end,
    'consentimento', p_versao, p_origem
  );
end
$$;

comment on function public.registrar_consentimento_marketing_whatsapp(uuid, boolean, text, text) is
  'Concede ou revoga marketing no WhatsApp (preferência + histórico), 0258. Só a chave de serviço.';

revoke all on function public.registrar_consentimento_marketing_whatsapp(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_consentimento_marketing_whatsapp(uuid, boolean, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. RLS das tabelas novas: só o servidor
-- ---------------------------------------------------------------------------

-- Por extenso, uma por tabela, e não no laço abaixo: `tabelasSeguras.test.ts`
-- lê o SQL e cobra o `revoke ... on public.<tabela> ... from anon` de toda
-- tabela criada depois da varredura da 0082.
revoke all on public.whatsapp_numeros_oficiais from anon, authenticated;
revoke all on public.whatsapp_modelos_oficiais from anon, authenticated;
revoke all on public.whatsapp_oficial_conversas from anon, authenticated;
revoke all on public.whatsapp_oficial_mensagens from anon, authenticated;
revoke all on public.whatsapp_oficial_eventos from anon, authenticated;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'whatsapp_numeros_oficiais',
    'whatsapp_modelos_oficiais',
    'whatsapp_oficial_conversas',
    'whatsapp_oficial_mensagens',
    'whatsapp_oficial_eventos'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabela);
    execute format('drop policy if exists isolamento_por_grupo on public.%I', v_tabela);
    execute format(
      'create policy isolamento_por_grupo on public.%I as restrictive for all to authenticated '
      'using (grupo_id = (select public.grupo_atual())) '
      'with check (grupo_id = (select public.grupo_atual()))',
      v_tabela
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Os gatilhos de grupo, refeitos com as mães novas
-- ---------------------------------------------------------------------------
--
-- O mesmo laço da 0191 (que lê as FKs reais), só para as tabelas desta
-- migration. Em `whatsapp_campanhas`, as mães passam a incluir o número e o
-- modelo oficiais: uma lista do grupo A apontando para o número do grupo B
-- falha em "grupo da linha difere".

do $$
declare
  v_tabela   record;
  v_mae      record;
  v_args     text[];
  v_colunas  text[];
  v_lista    text;
  v_ordem constant text[] := array[
    'lead_id', 'conversa_id', 'venda_id', 'campanha_id', 'instancia_id', 'corretor_id', 'parceiro_id',
    'empreendimento_id'
  ];
begin
  for v_tabela in
    select c.oid, c.relname
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and c.relname = any (array[
         'whatsapp_numeros_oficiais',
         'whatsapp_modelos_oficiais',
         'whatsapp_campanhas',
         'whatsapp_campanhas_fila',
         'whatsapp_oficial_conversas',
         'whatsapp_oficial_mensagens',
         'whatsapp_oficial_eventos'
       ])
     order by c.relname
  loop
    v_args := array[]::text[];
    v_colunas := array[]::text[];

    for v_mae in
      select fa.attname as coluna, mc.relname as mae, ra.attname as referenciada,
             array_length(k.conkey, 1) as tamanho
        from pg_constraint k
        join pg_class mc on mc.oid = k.confrelid
        join pg_attribute fa on fa.attrelid = k.conrelid and fa.attnum = k.conkey[1]
        join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
       where k.contype = 'f'
         and k.conrelid = v_tabela.oid
         and mc.relnamespace = 'public'::regnamespace
         and exists (
           select 1 from pg_attribute g
            where g.attrelid = k.confrelid and g.attname = 'grupo_id' and not g.attisdropped
         )
       order by coalesce(array_position(v_ordem, fa.attname::text), 100), fa.attname
    loop
      if v_mae.tamanho <> 1 then
        raise exception 'FK de % colunas em %.% não é tratada pelo carimbo',
          v_mae.tamanho, v_tabela.relname, v_mae.coluna;
      end if;
      v_args := v_args || array[v_mae.coluna::text, v_mae.mae::text, v_mae.referenciada::text];
      v_colunas := v_colunas || v_mae.coluna::text;
    end loop;

    v_lista := coalesce((select string_agg(format('%L', a), ', ') from unnest(v_args) a), '');

    execute format('drop trigger if exists %I on public.%I', v_tabela.relname || '_00_grupo', v_tabela.relname);
    execute format(
      'create trigger %I before insert or update of %s on public.%I
         for each row execute function public.carimbar_grupo(%s)',
      v_tabela.relname || '_00_grupo',
      (select string_agg(format('%I', c), ', ') from unnest('{grupo_id}'::text[] || v_colunas) c),
      v_tabela.relname,
      v_lista
    );

    execute format('drop trigger if exists %I on public.%I', v_tabela.relname || '_zz_grupo_update', v_tabela.relname);
    execute format(
      'create trigger %I after update on public.%I for each row
         when (%s)
         execute function public.conferir_grupo_final(%s)',
      v_tabela.relname || '_zz_grupo_update',
      v_tabela.relname,
      (select string_agg(format('new.%1$I is distinct from old.%1$I', c), ' or ')
         from unnest('{grupo_id}'::text[] || v_colunas) c),
      v_lista
    );

    execute format('drop trigger if exists %I on public.%I', v_tabela.relname || '_zz_grupo_insert', v_tabela.relname);
    if cardinality(v_colunas) > 0 then
      execute format(
        'create trigger %I after insert on public.%I for each row
           when (%s)
           execute function public.conferir_grupo_final(%s)',
        v_tabela.relname || '_zz_grupo_insert',
        v_tabela.relname,
        (select string_agg(format('new.%I is not null', c), ' or ') from unnest(v_colunas) c),
        v_lista
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. A lista oficial fora da cota de mensagens do plano (0214)
-- ---------------------------------------------------------------------------
--
-- Corpo idêntico ao da 0214 (única definição até aqui, conferido em
-- 03/11/2026), mais o desvio do item da lista oficial. O gatilho de falha
-- (-1) passa pelo mesmo desvio, então o que não somou também não desconta.

create or replace function public.contar_uso_de_recurso() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_mes date;
begin
  if new.grupo_id is null then
    return null;
  end if;
  -- 0258: mensagem da lista pelo número oficial não conta na cota do plano.
  -- IF aninhado de propósito: num `and` só, o PL/pgSQL monta a expressão
  -- inteira e `new.campanha_id` não existe em `imagens_geradas`/`video_jobs`
  -- ("record new has no field"); o `exception when others` abaixo engoliria
  -- o erro e a contagem de artes e vídeos pararia calada. Os testes da 0214
  -- (`limitesDoPlano.db.test.ts`) pegaram isso.
  if tg_table_name = 'whatsapp_campanhas_fila' then
    if exists (select 1 from whatsapp_campanhas c where c.id = new.campanha_id and c.canal = 'oficial') then
      return null;
    end if;
  end if;
  v_mes := date_trunc('month', coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo')::date;

  insert into uso_da_ia (grupo_id, mes, artes, videos, mensagens_lista)
  values (
    new.grupo_id,
    v_mes,
    case when tg_table_name = 'imagens_geradas' then greatest(v_delta, 0) else 0 end,
    case when tg_table_name = 'video_jobs' then greatest(v_delta, 0) else 0 end,
    case when tg_table_name = 'whatsapp_campanhas_fila' then greatest(v_delta, 0) else 0 end
  )
  on conflict (grupo_id, mes) do update set
    artes = greatest(0, uso_da_ia.artes + case when tg_table_name = 'imagens_geradas' then v_delta else 0 end),
    videos = greatest(0, uso_da_ia.videos + case when tg_table_name = 'video_jobs' then v_delta else 0 end),
    mensagens_lista = greatest(0, uso_da_ia.mensagens_lista
      + case when tg_table_name = 'whatsapp_campanhas_fila' then v_delta else 0 end),
    atualizado_em = now();
  return null;
exception when others then
  -- Contar o uso nunca pode derrubar a geração nem o envio da lista.
  raise warning 'contar_uso_de_recurso (%): %', tg_table_name, sqlerrm;
  return null;
end
$$;

comment on function public.contar_uso_de_recurso() is
  'Gatilhos de imagens_geradas, video_jobs e whatsapp_campanhas_fila (0214): soma (ou, na falha, tira) uma unidade no mês (São Paulo) do grupo da linha em uso_da_ia. Item de lista oficial (0258) não conta.';

revoke all on function public.contar_uso_de_recurso() from public, anon, authenticated;

commit;
