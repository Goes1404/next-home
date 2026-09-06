-- A arte composta (imagem + marca + copy) e o briefing que a produziu.
--
-- `url` continua sendo a imagem CRUA que saiu do modelo — o corretor pode
-- querer a versão sem texto. `arte_url` é o que vai para o story, o feed, o
-- anúncio ou o disparo. `briefing` guarda objetivo, canal, público, imóvel e a
-- copy final: é o que permite responder, daqui a um mês, qual peça virou lead,
-- e é o que a galeria mostra debaixo da arte.
--
-- Grants: SELECT e DELETE são de TABELA para `authenticated` (0090), então as
-- colunas novas já nascem legíveis pelo dono e sem escrita por ninguém além do
-- servidor. `anon` segue sem privilégio nenhum. Conferido depois de aplicar.

alter table public.imagens_geradas
  add column if not exists arte_url text,
  add column if not exists briefing jsonb;

comment on column public.imagens_geradas.arte_url is
  'Arte composta pronta para publicar (imagem + marca + copy). Nula na imagem livre.';
comment on column public.imagens_geradas.briefing is
  'Objetivo, canal, público, slug do imóvel e copy final da peça de marketing.';
