-- 0244 · ramo da conta: o CRM deixa de ser só de imobiliária (29/10/2026)
--
-- Pedido do dono (29/10/2026): "No app, não vamos limitar só para
-- imobiliárias, porque tem seguradoras, advocacia... que vamos vender nosso
-- sistema, com as mesmas funcionalidades. Na hora de contratar um plano,
-- coloque uma lista para a pessoa selecionar o ramo dela e a opção de outros
-- [...] No tipo de conta que vamos criar para a pessoa, vamos selecionar qual
-- ramo e personalizar algumas coisas pra ela."
--
--   1. `grupos.ramo`: o ramo do negócio da conta. Governa o vocabulário do
--      painel (corretor → consultor, imóvel → produto...), os módulos do
--      menu e o enquadramento da IA do WhatsApp (src/lib/ramos/). A lista
--      espelha `RAMOS` de src/lib/ramos/ramos.ts: mudou lá, muda aqui.
--      Toda linha que já existe fica 'imobiliaria' (o default): nenhuma
--      conta de hoje muda de cara.
--   2. `grupos.ramo_descricao`: o texto livre de quem escolheu 'outro'
--      ("Clínica veterinária"), de 2 a 80 caracteres. Só existe com 'outro'.
--   3. `pedidos_de_contratacao.ramo` e `.ramo_descricao`: o mesmo par no
--      pedido do assistente /astro/contratar, para a plataforma criar a
--      conta já no ramo certo.
--   4. Leitura do logado: `ramo` e `ramo_descricao` entram no
--      `grant select (...)` de `grupos` (0196 recortou o SELECT do
--      `authenticated` a colunas). Sem isso o painel não leria o próprio ramo
--      e todo mundo veria o CRM de imobiliária. A policy da 0190 já recorta
--      a linha ao grupo dele. Escrita continua só pela chave de serviço
--      (a plataforma muda o ramo; o logado não).
--   5. `admin_eventos`: a ação `ramo_do_grupo_alterado` (a plataforma trocou
--      o ramo da conta). A lista do CHECK é a união da 0243 (que já traz a
--      0241), mais a nova.
--
-- Só aditivo. Reversão:
--   alter table public.grupos drop column if exists ramo_descricao, drop column if exists ramo;
--   alter table public.pedidos_de_contratacao drop column if exists ramo_descricao, drop column if exists ramo;
--   e o CHECK de admin_eventos pela lista da 0243.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. grupos
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists ramo text not null default 'imobiliaria'
    constraint grupos_ramo_check check (ramo in (
      'imobiliaria', 'seguros', 'advocacia', 'contabilidade', 'saude',
      'educacao', 'varejo', 'servicos', 'outro'
    )),
  add column if not exists ramo_descricao text
    constraint grupos_ramo_descricao_check
      check (ramo_descricao is null or length(btrim(ramo_descricao)) between 2 and 80);

-- O texto livre só acompanha 'outro', e 'outro' sempre o tem.
alter table public.grupos drop constraint if exists grupos_ramo_descricao_do_outro;
alter table public.grupos add constraint grupos_ramo_descricao_do_outro
  check ((ramo = 'outro') = (ramo_descricao is not null));

comment on column public.grupos.ramo is
  'Ramo do negócio da conta (0244): vocabulário, módulos do painel e enquadramento da IA. Lista em src/lib/ramos/ramos.ts.';
comment on column public.grupos.ramo_descricao is
  'Descrição livre do ramo quando ramo = outro (0244), 2 a 80 caracteres.';

grant select (ramo, ramo_descricao) on public.grupos to authenticated;

-- ---------------------------------------------------------------------------
-- 2. pedidos_de_contratacao
-- ---------------------------------------------------------------------------

alter table public.pedidos_de_contratacao
  add column if not exists ramo text not null default 'imobiliaria'
    constraint pedidos_de_contratacao_ramo_check check (ramo in (
      'imobiliaria', 'seguros', 'advocacia', 'contabilidade', 'saude',
      'educacao', 'varejo', 'servicos', 'outro'
    )),
  add column if not exists ramo_descricao text
    constraint pedidos_de_contratacao_ramo_descricao_check
      check (ramo_descricao is null or length(btrim(ramo_descricao)) between 2 and 80);

alter table public.pedidos_de_contratacao drop constraint if exists pedidos_de_contratacao_ramo_descricao_do_outro;
alter table public.pedidos_de_contratacao add constraint pedidos_de_contratacao_ramo_descricao_do_outro
  check ((ramo = 'outro') = (ramo_descricao is not null));

comment on column public.pedidos_de_contratacao.ramo is
  'Ramo que a pessoa escolheu no assistente /astro/contratar (0244).';
comment on column public.pedidos_de_contratacao.imobiliaria is
  'Nome da empresa (do plano de equipe, id ''imobiliaria''), de qualquer ramo desde a 0244.';

-- ---------------------------------------------------------------------------
-- 3. admin_eventos: a troca de ramo pela plataforma
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
  'visao_de_suporte_aberta',
  'teste_gratis_iniciado', 'cobranca_automatica_ligada', 'cobranca_automatica_desligada',
  -- A plataforma trocou o ramo da conta (0244).
  'ramo_do_grupo_alterado'
));

commit;
