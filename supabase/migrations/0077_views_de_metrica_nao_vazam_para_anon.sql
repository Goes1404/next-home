-- 0077 — As views de métrica não podem ser lidas sem login
--
-- ## O achado
--
-- Revisão de segurança do próprio trabalho da noite (01/09/2026). As views
-- `whatsapp_funil_metricas` e `whatsapp_resposta_metricas` estavam legíveis
-- pelo papel `anon` — ou seja, por qualquer pessoa com a chave pública do
-- Supabase, que por desenho vai no bundle JavaScript do site.
--
-- Provado antes de corrigir, com `set local role anon`: as duas devolviam
-- 1 linha. O que vazava não é mensagem nem PII, mas é o retrato da
-- operação: quantas conversas existem, quantas a IA atendeu, a mediana de
-- resposta e os degraus do funil.
--
-- ## Duas causas somadas, e as duas precisam ser tratadas
--
-- 1. **O grant.** Uma view criada sem `revoke` herda os privilégios
--    padrão do schema `public` do Supabase, que incluem `anon`. Isto vale
--    para toda view nova: a 0075 nasceu assim, e a 0072 REPÔS o problema
--    ao fazer `drop view` + `create view` (recriar zera o que havia).
-- 2. **A RLS que a view não herda.** Uma view em Postgres roda com os
--    privilégios de QUEM A CRIOU, não de quem consulta — então ela
--    atravessa a RLS das tabelas de baixo. `security_invoker = on` inverte
--    isso: a política de `whatsapp_conversas` e `whatsapp_mensagens` passa
--    a valer para quem consulta.
--
-- Só o revoke bastaria para fechar o `anon`, mas deixaria de pé o caso em
-- que um corretor comum lê o agregado de OUTRO corretor consultando a view
-- direto pelo PostgREST, sem o `.eq("corretor_id", ...)` que as telas usam.
-- A RLS é quem resolve isso, e é ela que deve resolver.
--
-- ## Conferido nos dois sentidos antes de aplicar
--
--   anon                     -> sem acesso
--   o corretor dono (gestor) -> continua vendo a linha dele (12 atendidas)
--
-- A segunda metade é a que importa: consertar segurança quebrando a tela
-- não é consertar.
--
-- **Ao criar view nova neste projeto, os dois passos são obrigatórios.**

revoke select on public.whatsapp_funil_metricas from anon;
revoke select on public.whatsapp_resposta_metricas from anon;

alter view public.whatsapp_funil_metricas set (security_invoker = on);
alter view public.whatsapp_resposta_metricas set (security_invoker = on);

-- Guarda: `src/lib/viewsSeguras.test.ts` lê estas migrations e reprova
-- qualquer view do schema `public` sem os dois passos acima. A regressão
-- falharia CALADA — build passa, tela funciona, e só um `curl` com a chave
-- pública revelaria.
