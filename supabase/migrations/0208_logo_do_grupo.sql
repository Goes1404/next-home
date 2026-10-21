-- 0208 · logo do grupo no CRM (marca de cada imobiliária dentro do painel, 21/10/2026)
--
-- O cliente que entra pelo CRM (astroimob.vercel.app) não pode ver a marca da
-- Next Home depois do login. O nome já existe (`grupos.nome` e
-- `grupos.ia_nome_da_casa`, 0199); falta a logo.
--
--   1. `grupos.logo_url`: endereço PÚBLICO da logo (bucket `empreendimentos`,
--      `grupos/<grupo_id>/logo-<hash>.<ext>`). Nulo = o nome escrito. Como o
--      resto de `grupos` (0190 §6), só a chave de serviço escreve: a coluna
--      NÃO ganha UPDATE para o logado, e quem grava é a Server Action da
--      plataforma ou a do gestor do grupo (que vale só para o próprio grupo).
--      Leitura para o logado como as colunas `ia_*` (0199): a policy da 0190
--      já recorta a linha ao grupo dele.
--   2. `admin_eventos`: a ação `logo_do_grupo_alterada`. A lista do CHECK é a
--      da 0207 inteira, mais a nova.
--
-- Reversão:
--   alter table public.grupos drop column if exists logo_url;
--   e o CHECK de admin_eventos pela lista da 0207.

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists logo_url text
    check (logo_url is null or (char_length(logo_url) <= 500 and logo_url ~ '^https://'));

comment on column public.grupos.logo_url is
  'Logo do grupo no CRM (URL pública do Storage). Nulo = o nome escrito. Só a chave de serviço grava (0208).';

grant select (logo_url) on public.grupos to authenticated;

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (acao in (
  'conta_criada', 'senha_redefinida', 'papel_alterado', 'corretor_desativado', 'corretor_reativado',
  'leads_redistribuidos', 'numero_desconectado', 'grupo_criado', 'grupo_desfeito', 'convite_enviado',
  'convite_reenviado', 'email_alterado', 'link_de_senha_enviado', 'link_de_senha_pedido',
  'cota_da_ia_ajustada', 'identidade_da_ia_alterada', 'fichas_exportadas',
  'dados_do_grupo_exportados', 'titular_apagado', 'grupo_cancelado', 'cancelamento_desfeito',
  'dados_do_grupo_apagados', 'falha_ao_apagar_dados_do_grupo', 'copia_final_baixada', 'copia_final_apagada',
  'pagamento_registrado', 'pagamento_removido', 'grupo_suspenso', 'grupo_reativado',
  -- A logo do grupo no CRM foi trocada ou removida (0208).
  'logo_do_grupo_alterada'
));

commit;
