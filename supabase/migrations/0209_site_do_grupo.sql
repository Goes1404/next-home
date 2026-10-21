-- 0209 · "Meu site": o que cada imobiliária edita no site público dela (21/10/2026)
--
-- Fase 3 (site por endereço) e 0208 (logo do grupo) já estão no ar. Falta a
-- imobiliária mexer no próprio site sem pedir ao operador: cor, capa, título e
-- frase de abertura, texto "Sobre", contatos e redes.
--
-- DECISÃO: colunas novas em `grupos`, e não uma tabela `sites_do_grupo` 1:1.
-- É um conjunto pequeno e fixo de campos, lido sempre junto com a linha do
-- grupo (nome, logo, CRECI); uma tabela a mais pediria RLS, carimbo de grupo,
-- grants e um join sem nenhum ganho. `grupos` já é "só a chave de serviço
-- escreve" (0190 §6): as colunas novas NÃO ganham grant nenhum para o logado
-- (nem SELECT — a leitura do site público é pelo servidor, como `MarcaDoSite`
-- já faz, nunca pela chave anon). Quem grava é a Server Action do gestor
-- (só o grupo dele) ou nenhuma outra.
--
--   1. Colunas `site_*` com CHECK de tamanho e de formato (hex, https, uf).
--      Tudo nulo = o site cai no comportamento de hoje. O grupo 1 (Next Home)
--      tem as colunas, mas o site dela NÃO as lê (regra do dono, 21/10).
--   2. `admin_eventos`: `site_do_grupo_alterado`, `endereco_do_site_ligado` e
--      `endereco_do_site_removido`. A lista do CHECK é a da 0208 inteira, mais
--      as novas.
--
-- Reversão:
--   alter table public.grupos
--     drop column if exists site_cor, drop column if exists site_capa_url,
--     drop column if exists site_titulo, drop column if exists site_frase,
--     drop column if exists site_sobre, drop column if exists site_whatsapp,
--     drop column if exists site_email, drop column if exists site_endereco,
--     drop column if exists site_instagram, drop column if exists site_facebook;
--   e o CHECK de admin_eventos pela lista da 0208.

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists site_cor text
    check (site_cor is null or site_cor ~ '^#[0-9a-f]{6}$'),
  add column if not exists site_capa_url text
    check (site_capa_url is null or (char_length(site_capa_url) <= 500 and site_capa_url ~ '^https://')),
  add column if not exists site_titulo text
    check (site_titulo is null or char_length(site_titulo) between 1 and 90),
  add column if not exists site_frase text
    check (site_frase is null or char_length(site_frase) between 1 and 200),
  add column if not exists site_sobre text
    check (site_sobre is null or char_length(site_sobre) between 1 and 1200),
  add column if not exists site_whatsapp text
    check (site_whatsapp is null or site_whatsapp ~ '^55[0-9]{10,11}$'),
  add column if not exists site_email text
    check (site_email is null or (char_length(site_email) <= 160 and site_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column if not exists site_endereco jsonb
    check (
      site_endereco is null or (
        jsonb_typeof(site_endereco) = 'object'
        and pg_column_size(site_endereco) <= 1000
        and (site_endereco - 'logradouro' - 'bairro' - 'cidade' - 'uf' - 'cep') = '{}'::jsonb
        and coalesce(site_endereco ->> 'uf', '') ~ '^[A-Z]{2}$'
      )
    ),
  add column if not exists site_instagram text
    check (site_instagram is null or (char_length(site_instagram) <= 300 and site_instagram ~ '^https://')),
  add column if not exists site_facebook text
    check (site_facebook is null or (char_length(site_facebook) <= 300 and site_facebook ~ '^https://'));

comment on column public.grupos.site_cor is
  'Cor principal do site do grupo (#rrggbb minúsculo). Nulo = a cor padrão. Só a chave de serviço grava (0209).';
comment on column public.grupos.site_endereco is
  'Endereço do escritório no site: {logradouro, bairro, cidade, uf, cep}. Só a chave de serviço grava (0209).';

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
  -- O site do grupo foi editado pelo gestor, e a plataforma ligou ou tirou um endereço (0209).
  'site_do_grupo_alterado', 'endereco_do_site_ligado', 'endereco_do_site_removido'
));

commit;
