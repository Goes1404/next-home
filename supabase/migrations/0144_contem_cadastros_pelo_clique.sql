-- 0144: os dois números cadastrados pela regra do clique (0143) eram
-- conhecidos do corretor. IA desligada nas conversas e lead arquivado
-- (excluir é decisão do corretor, na lista de arquivados).
update public.whatsapp_conversas
   set bot_ativo = false, liberado_por_palavra_chave = false
 where lead_id in (select lead_id from public.cliques_whatsapp where lead_id is not null);
update public.leads
   set arquivado_em = now()
 where id in (select lead_id from public.cliques_whatsapp where lead_id is not null)
   and arquivado_em is null;
