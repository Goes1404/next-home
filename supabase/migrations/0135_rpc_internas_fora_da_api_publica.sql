-- 0135: funções internas fora do alcance da chave pública (02/10/2026)
--
-- O advisor de segurança do Supabase listou funções `security definer` que o
-- papel `anon` (a chave que vai no JavaScript do site, por desenho) consegue
-- chamar por `/rest/v1/rpc/...`. Quatro delas NÃO conferem quem chama:
--
--   consumir_cota_campanha       qualquer pessoa esgotaria a cota de disparo
--   devolver_cota_campanha       qualquer pessoa devolveria cota (afrouxa o anti-ban)
--   resetar_cota_campanha        qualquer pessoa zeraria a cota do dia
--   processar_outbox_analytics_interno  qualquer pessoa rodaria o processamento
--
-- Quem as chama de verdade:
--   - consumir / devolver / outbox: o servidor, com a chave de serviço;
--   - resetar: o botão "Resetar cota" do painel, com a sessão do corretor, e a
--     action escolhe a instância DELE antes de chamar.
-- Por isso: ninguém além do service_role nas três primeiras; a de resetar
-- continua para `authenticated` e sai do `anon`.
--
-- `revoke ... from public` é o que tira o padrão do Postgres; `anon` e
-- `authenticated` vão nomeados porque o Supabase os concede um a um.

revoke execute on function public.consumir_cota_campanha(uuid, integer) from public, anon, authenticated;
revoke execute on function public.devolver_cota_campanha(uuid) from public, anon, authenticated;
revoke execute on function public.processar_outbox_analytics_interno(integer) from public, anon, authenticated;
revoke execute on function public.resetar_cota_campanha(uuid) from public, anon;

grant execute on function public.consumir_cota_campanha(uuid, integer) to service_role;
grant execute on function public.devolver_cota_campanha(uuid) to service_role;
grant execute on function public.processar_outbox_analytics_interno(integer) to service_role;
grant execute on function public.resetar_cota_campanha(uuid) to authenticated, service_role;
