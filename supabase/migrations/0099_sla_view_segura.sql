-- 0099 — A view do SLA entra no regime de segurança das outras (06/09/2026).
--
-- `sla_leads_metricas` nasceu na 0068, num branch anterior à revisão de
-- 01/09 que fechou `whatsapp_funil_metricas` e `whatsapp_resposta_metricas`
-- (ver viewsSeguras.test.ts). O merge trouxe a view sem as duas guardas que
-- toda view do schema public precisa:
--
-- 1. `revoke select ... from anon` — view nova herda os privilégios padrão
--    do schema, que incluem a chave pública do site;
-- 2. `security_invoker = on` — sem isso a view roda com os privilégios de
--    quem a criou e atravessa a RLS de `leads` e `whatsapp_mensagens`.

alter view public.sla_leads_metricas set (security_invoker = on);

revoke select on public.sla_leads_metricas from anon;

-- Reversão:
--   alter view public.sla_leads_metricas set (security_invoker = off);
--   grant select on public.sla_leads_metricas to anon;  -- (não faça isso)
