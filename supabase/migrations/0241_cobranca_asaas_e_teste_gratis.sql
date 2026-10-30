-- 0241 · cobrança automática pelo Asaas e teste grátis de 7 dias (29/10/2026)
--
-- Duas funções aprovadas pelo dono no mesmo dia:
--
--   1. Cobrança automática (Asaas: Pix, boleto e cartão). A plataforma liga
--      a cobrança de um grupo (cliente + assinatura mensal no Asaas) e o
--      webhook `/api/webhooks/asaas` registra cada pagamento recebido em
--      `pagamentos_do_grupo`, como o registro à mão da 0207. A suspensão por
--      atraso continua DERIVADA (src/lib/planos/cobranca.ts): o pagamento
--      registrado já reativa o grupo suspenso por atraso.
--
--        - `grupos.asaas_cliente_id` / `grupos.asaas_assinatura_id`: o
--          cliente e a assinatura do grupo no Asaas. Únicos quando
--          preenchidos: o webhook acha o grupo pela assinatura (ou pelo
--          cliente) do pagamento, e dois grupos com o mesmo id seriam
--          ambíguos.
--        - `pagamentos_do_grupo.asaas_pagamento_id`: o id do pagamento no
--          Asaas, ÚNICO. O Asaas entrega "pelo menos uma vez": o mesmo
--          evento chega de novo e não pode registrar o pagamento duas vezes.
--
--   2. Teste grátis de 7 dias pelo assistente `/astro/contratar`: a conta
--      nasce na hora, e o primeiro acesso cria a senha pelo link do convite
--      (que é a confirmação do e-mail).
--
--        - `grupos.teste_ate`: o fim do teste. Enquanto `now() < teste_ate` a
--          cobrança está em `teste`; a primeira competência vence NO dia do
--          fim do teste e, sem pagamento, a suspensão é imediata (sem os 5
--          dias de tolerância). O gatilho `registrar_primeira_mensalidade`
--          (0207) não muda: o caminho do teste apaga a linha de valor 0 que
--          ele grava (src/lib/plataforma/testeGratis.ts).
--        - `pedidos_de_contratacao.documento` (CPF/CNPJ, opcional) e
--          `pedidos_de_contratacao.teste_gratis`: um teste por e-mail, por
--          WhatsApp e por CPF/CNPJ. Os índices únicos PARCIAIS abaixo são a
--          trava de verdade (dois envios ao mesmo tempo não passam os dois);
--          a action confere antes só para dar a frase certa.
--
--   3. `admin_eventos`: `teste_gratis_iniciado` (origem `teste-gratis`, sem
--      ator: quem criou foi o sistema, a partir do pedido em `detalhes`),
--      `cobranca_automatica_ligada` e `cobranca_automatica_desligada`. A
--      lista é a da 0237 mais as três.
--
-- Nenhuma coluna nova ganha grant para o `authenticated` (como a 0207 e a
-- 0234): só a chave de serviço lê e escreve. O painel lê a cobrança pelo
-- servidor (`lerCobrancaDoGrupo`), recortado pelo grupo da sessão.
--
-- Só aditivo. Aplicar ANTES do deploy (o código grava as colunas novas).
--
-- Reversão:
--   drop index if exists public.pedidos_teste_gratis_email_unico,
--     public.pedidos_teste_gratis_whatsapp_unico, public.pedidos_teste_gratis_documento_unico,
--     public.grupos_asaas_cliente_unico, public.grupos_asaas_assinatura_unica;
--   alter table public.pedidos_de_contratacao drop column if exists documento,
--     drop column if exists teste_gratis;
--   alter table public.pagamentos_do_grupo drop column if exists asaas_pagamento_id;
--   alter table public.grupos drop column if exists asaas_cliente_id,
--     drop column if exists asaas_assinatura_id, drop column if exists teste_ate;
--   e o CHECK de admin_eventos pela lista da 0237 (apagar antes as linhas
--   com as três ações novas, se houver).

begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. grupos: Asaas e teste grátis
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists asaas_cliente_id text
    check (asaas_cliente_id is null or length(asaas_cliente_id) between 1 and 100),
  add column if not exists asaas_assinatura_id text
    check (asaas_assinatura_id is null or length(asaas_assinatura_id) between 1 and 100),
  add column if not exists teste_ate timestamptz;

comment on column public.grupos.asaas_cliente_id is
  'Id do cliente do grupo no Asaas (cus_...). Só a chave de serviço (0241).';
comment on column public.grupos.asaas_assinatura_id is
  'Id da assinatura mensal ativa no Asaas (sub_...); nulo = cobrança automática desligada (0241).';
comment on column public.grupos.teste_ate is
  'Fim do teste grátis. Antes dele a cobrança é "teste"; a primeira competência vence no dia dele, sem tolerância (0241).';

create unique index if not exists grupos_asaas_cliente_unico
  on public.grupos (asaas_cliente_id) where asaas_cliente_id is not null;
create unique index if not exists grupos_asaas_assinatura_unica
  on public.grupos (asaas_assinatura_id) where asaas_assinatura_id is not null;

-- ---------------------------------------------------------------------------
-- 2. pagamentos_do_grupo: idempotência do webhook
-- ---------------------------------------------------------------------------

alter table public.pagamentos_do_grupo
  add column if not exists asaas_pagamento_id text unique
    check (asaas_pagamento_id is null or length(asaas_pagamento_id) between 1 and 100);

comment on column public.pagamentos_do_grupo.asaas_pagamento_id is
  'Id do pagamento no Asaas (pay_...) quando veio pelo webhook; único: o evento repetido não registra de novo (0241).';

-- ---------------------------------------------------------------------------
-- 3. pedidos_de_contratacao: um teste por e-mail, WhatsApp e CPF/CNPJ
-- ---------------------------------------------------------------------------

alter table public.pedidos_de_contratacao
  add column if not exists documento text
    check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  add column if not exists teste_gratis boolean not null default false;

comment on column public.pedidos_de_contratacao.documento is
  'CPF (11) ou CNPJ (14 dígitos) informado no pedido, opcional (0241).';
comment on column public.pedidos_de_contratacao.teste_gratis is
  'O pedido pediu o teste grátis de 7 dias. Um por e-mail, WhatsApp e documento (índices únicos parciais, 0241).';

create unique index if not exists pedidos_teste_gratis_email_unico
  on public.pedidos_de_contratacao (lower(email)) where teste_gratis;
create unique index if not exists pedidos_teste_gratis_whatsapp_unico
  on public.pedidos_de_contratacao (whatsapp) where teste_gratis;
create unique index if not exists pedidos_teste_gratis_documento_unico
  on public.pedidos_de_contratacao (documento) where teste_gratis and documento is not null;

-- ---------------------------------------------------------------------------
-- 4. admin_eventos: teste grátis e cobrança automática
-- ---------------------------------------------------------------------------

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (acao in (
  'conta_criada', 'senha_redefinida', 'papel_alterado', 'corretor_desativado', 'corretor_reativado',
  'leads_redistribuidos', 'numero_desconectado', 'grupo_criado', 'grupo_desfeito', 'convite_enviado',
  'convite_reenviado', 'email_alterado', 'link_de_senha_enviado', 'link_de_senha_pedido',
  'cota_da_ia_ajustada', 'identidade_da_ia_alterada', 'fichas_exportadas',
  'dados_do_grupo_exportados', 'titular_apagado', 'grupo_cancelado', 'cancelamento_desfeito',
  'dados_do_grupo_apagados', 'falha_ao_apagar_dados_do_grupo', 'copia_final_baixada', 'copia_final_apagada',
  'pagamento_registrado', 'pagamento_removido', 'grupo_suspenso', 'grupo_reativado',
  'logo_do_grupo_alterada',
  'site_do_grupo_alterado', 'endereco_do_site_ligado', 'endereco_do_site_removido',
  'plano_alterado', 'admin_da_plataforma_adicionado', 'admin_da_plataforma_removido',
  -- Teste grátis criado pelo assistente e cobrança automática do Asaas (0241).
  'teste_gratis_iniciado', 'cobranca_automatica_ligada', 'cobranca_automatica_desligada',
  -- A 0243 (visão de suporte) chegou à produção ANTES desta (29/10/2026): o
  -- valor dela fica aqui também, senão aplicar esta depois o derrubaria.
  'visao_de_suporte_aberta'
));

commit;
