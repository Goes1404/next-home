-- 0196 · dado pessoal do corretor fora da chave pública (fase 2A, spec §15)
--
-- Nasceu como 0187 na branch `fase-2-plataforma`, sobre a numeração antiga
-- da fase 1; renumerada para 0196 na junção de 20/10/2026 (depois da 0194).
--
-- 1. `corretores` é lida pela chave `anon` (a página da equipe e o link
--    pessoal, `src/lib/catalogo/cache.ts`), pela policy "corretores
--    visiveis ao publico" (0189, `using (not oculta)`) e por um SELECT de
--    TABELA — todas as colunas. Até aqui `email` guardava o endereço de acesso
--    `nome@nexthome.com`; com o convite da fase 2 ele passa a ser o e-mail
--    REAL de cada corretor, de todos os grupos, listável pelo PostgREST com a
--    chave que vai no bundle do site. A leitura pública fica restrita às
--    colunas que o site lê hoje:
--
--      id, slug, nome, creci, whatsapp, foto_url, video_url, fundo_tipo,
--      fundo_foto_url, bio  — o que a vitrine mostra (`SELECT_CORRETOR`);
--      so_whatsapp, ativo, grupo_id — o que o site FILTRA (filtrar exige
--      SELECT na coluna);
--      chamada_do_link (0188) — o texto da prévia do link pessoal;
--      oculta (0189) — a segunda trava do recorte da conta oculta no
--      código (`contaOculta.ts`). A primeira é a policy da 0189, que esta
--      migration NÃO toca: o `anon` só enxerga linha com `not oculta`, então
--      ler a coluna não revela conta oculta nenhuma (ela vem sempre falsa).
--
--    O `revoke select` de tabela leva junto os grants por COLUNA do `anon`
--    (o `grant select (chamada_do_link)` da 0188 inclusive): por isso
--    `chamada_do_link` está na lista abaixo, senão a prévia do link cairia
--    no padrão calada.
--
--    Saem do `anon`: `email`, `user_id`, `deve_trocar_senha` — e, por não
--    serem lidas pelo site, `papel`, `regioes`, `em_pausa`, `created_at`,
--    `resumo_diario_em`, `resumo_hora`, `resumo_fim_de_semana` e
--    `relatorio_avaliacoes_em`. A lista é a mesma de
--    `COLUNAS_PUBLICAS_DE_CORRETOR` (`src/lib/corretores/colunasPublicas.ts`),
--    e `colunasPublicas.test.ts` compara as duas.
--
--    Grant por coluna sem revogar o de tabela é decorativo (0116): o revoke
--    vem antes. `authenticated` não muda — o painel lê a ficha pela sessão, e
--    o recorte por grupo dele é a `isolamento_por_grupo` (0193).
--
-- 2. `grupos`: a 0190 deu ao logado SELECT de TABELA, recortado à linha do
--    próprio grupo pela policy. Com as colunas da 0195, todo corretor do
--    grupo leria o CPF/CNPJ (`documento`), a razão social, o contato de
--    cobrança e o encarregado da LGPD — dado da relação do grupo com a
--    plataforma, não da equipe. O logado passa a ler só:
--
--      id, nome, slug, tipo, plano, situacao, criado_em
--
--    (o tipo é o que o menu precisa; plano e situação, o que a tela de conta
--    mostra). O resto é lido pela chave de serviço, no painel da plataforma.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. corretores: a chave pública lê só as colunas públicas
-- ---------------------------------------------------------------------------

revoke select on public.corretores from anon;
grant select (
  id, slug, nome, creci, whatsapp, foto_url, video_url, fundo_tipo, fundo_foto_url, bio,
  so_whatsapp, ativo, grupo_id, chamada_do_link, oculta
) on public.corretores to anon;

-- ---------------------------------------------------------------------------
-- 2. grupos: o logado lê o básico, não o cadastro da plataforma
-- ---------------------------------------------------------------------------

revoke select on public.grupos from authenticated;
grant select (id, nome, slug, tipo, plano, situacao, criado_em) on public.grupos to authenticated;

commit;
