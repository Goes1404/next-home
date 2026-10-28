-- 0229: textos personalizáveis da roleta no modo grupo e do relatório no grupo
-- (28/10/2026).
--
-- 1. `roleta_anuncios.texto_boas_vindas`: no modo 'grupo', a mensagem que o
--    número do anúncio manda ao cliente quando a roleta passa o lead adiante.
--    Nula ou vazia: nada sai (a boas-vindas fixa foi tirada a pedido do dono
--    em 27/10; agora só sai o que ele escrever).
-- 2. `grupos.texto_aviso_grupo_leads`: o modelo do relatório que chega no grupo
--    do corretor a cada lead (`montarAvisoNoGrupo`). Nulo: o texto de sempre.
--
-- Aditiva. Nenhum grant novo: as duas tabelas são lidas e gravadas pela chave
-- de serviço (roleta_anuncios não tem grant; em `grupos` o logado só lê as
-- colunas públicas, 0196).

begin;

set local lock_timeout = '5s';

alter table public.roleta_anuncios
  add column if not exists texto_boas_vindas text;

alter table public.grupos
  add column if not exists texto_aviso_grupo_leads text;

alter table public.grupos
  drop constraint if exists grupos_texto_aviso_grupo_leads_tamanho;
alter table public.grupos
  add constraint grupos_texto_aviso_grupo_leads_tamanho
  check (texto_aviso_grupo_leads is null or char_length(texto_aviso_grupo_leads) <= 1000);

commit;
