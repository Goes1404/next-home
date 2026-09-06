-- 0080 — Na fila de candidatos, só a DECISÃO é editável (e o `anon` não entra)
--
-- Revisão da 0078 pela régua que a 0077 deixou: tabela criada no schema
-- `public` do Supabase NASCE com grant para `anon` e para `authenticated`
-- em tudo. Conferido com `information_schema.column_privileges`: as duas
-- roles tinham select, insert e update nas 15 colunas.
--
-- Duas correções, e as duas são de camada diferente:
--
-- 1. **O `anon` sai.** Hoje ele já não lê nada — a RLS está ligada e as
--    policies são `to authenticated`. Mas a chave `anon` vai no bundle do
--    site POR DESENHO, e uma policy futura escrita sem `to` reabriria isso
--    em silêncio. O grant é a camada que não depende de ninguém lembrar.
--
-- 2. **O `authenticated` perde o INSERT e ganha update COLUNA A COLUNA.**
--    O comentário da 0078 já dizia "sem INSERT para authenticated" —
--    descrevia a policy, e o grant contava outra história. Quem popula a
--    fila é o levantamento, com a service key; a tela só DECIDE. Sem o
--    recorte por coluna, um update pela API poderia reescrever `nome`,
--    `link` ou `ref_externa`, e a fila deixaria de espelhar a fonte
--    justamente onde ela serve para isso.
--
-- Mesma lição do `papel` em `corretores` e do `leads` da 0007: policy diz
-- QUEM pode agir sobre a linha; grant diz o QUE pode ser mudado nela. As
-- duas perguntas são diferentes e as duas precisam de resposta.

revoke all on public.catalogo_candidatos from anon;

revoke insert, update, delete, truncate on public.catalogo_candidatos from authenticated;

grant update (decisao, motivo, decidido_em, empreendimento_id)
  on public.catalogo_candidatos to authenticated;
