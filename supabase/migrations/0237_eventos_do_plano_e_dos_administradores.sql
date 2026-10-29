-- 0237 · eventos da troca de plano e dos administradores da plataforma (29/10/2026)
--
-- Pedido do dono: o administrador da plataforma passa a mudar o plano de um
-- grupo (`mudarPlanoDoGrupo`, src/app/plataforma/acoes.ts) e a pôr e tirar
-- outros administradores (`src/app/plataforma/administradoresAcoes.ts`). As
-- duas ações deixam rastro em `admin_eventos`, e o CHECK de `acao` ganha:
--
--   - `plano_alterado`: evento do grupo, `detalhes` = {origem, antes, depois,
--     limites_voltaram_ao_padrao};
--   - `admin_da_plataforma_adicionado` e `admin_da_plataforma_removido`:
--     eventos da PLATAFORMA (`grupo_id` nulo, nenhuma mãe preenchida,
--     `detalhes.origem = 'plataforma'`, como o `grupo_desfeito`), com
--     `detalhes.user_id` do login alvo — sem e-mail.
--
-- Só aditivo: a lista é a da 0209 mais os três valores. O código no ar antes
-- desta migration grava os eventos com `insert` que, recusado, só vai ao log;
-- a ação em si não depende dela. Aplicar ANTES do deploy para não perder o
-- rastro.
--
-- Reversão: recriar o CHECK com a lista da 0209 (falha se já houver linha
-- com um dos três valores novos; apagá-las antes, se for o caso).

begin;
set local lock_timeout = '5s';

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
  -- A plataforma muda o plano do grupo e põe/tira administradores (0237).
  'plano_alterado', 'admin_da_plataforma_adicionado', 'admin_da_plataforma_removido'
));

commit;
