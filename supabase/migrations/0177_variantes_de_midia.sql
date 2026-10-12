-- 0177 — Variantes responsivas das fotos do catálogo (12/10/2026)
--
-- Desde 09/10 as imagens saem SEM o otimizador da Vercel (cota mensal do
-- Hobby: quando acabou, respondia 402 e a foto aparecia quebrada). O arquivo
-- original passou a ir cru ao navegador: medido na listagem, as capas vão de
-- 70 a 430 KB cada, sem `srcset`, para um cartão de ~360px no celular.
--
-- A saída é a nossa: ao registrar a mídia, `registrarMidia` gera versões WebP
-- em 480, 960 e 1440px de largura (só as MENORES que o original) e as sobe
-- ao lado do arquivo (`<nome>.w480.webp`…). Esta coluna lista as larguras
-- que EXISTEM no Storage para aquela linha. `next/image` pede ao loader
-- próprio (`src/lib/imagens/loaderDeImagem.ts`) a variante certa — e o loader
-- só transforma URL cuja linha diz que a variante existe. Sem a lista, um
-- `srcset` apontando para arquivo inexistente quebraria a foto (o navegador
-- não tem fallback para candidato 404), que é a falha calada que esta base
-- mais combate.
--
-- `null` = ninguém conferiu ainda (o backfill `scripts/catalogo/gerarVariantes.ts`
-- varre estas); `{}` = conferida, nenhuma variante possível (original menor
-- que 480px, SVG, GIF). A tabela tem grant de TABELA (nunca passou por revoke
-- por coluna), então a coluna nova herda o SELECT do `anon`, que o site
-- público precisa — conferido com has_column_privilege depois de aplicar.
alter table public.midias
  add column if not exists variantes integer[];

comment on column public.midias.variantes is
  'Larguras (px) das versões WebP que existem no Storage ao lado do original (<nome>.w<largura>.webp). null = não conferida; {} = sem variante possível. Ver src/lib/imagens/variantes.ts.';
