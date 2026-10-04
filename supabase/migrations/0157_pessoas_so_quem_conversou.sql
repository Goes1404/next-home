-- 0157: a aba Conversas (Pessoas) mostra só quem já conversou (03/10/2026).
--
-- A 0156 filtrou a tela "Respostas da IA"; o pedido era a aba que o menu
-- chama de CONVERSAS, que é a lista de Pessoas (`pessoas_do_corretor`, 0088).
-- Ela une conversas e leads sem conversa, então lead recém-importado aparecia
-- ali como se tivesse falado. Print do usuário: três telefones importados há
-- 7 minutos, nenhum com mensagem.
--
-- A coluna nova `conversou` diz se o cliente falou ao menos uma vez: na parte
-- das conversas, por EXISTS na fala do cliente (índice de conversa_id); na
-- parte dos leads sem conversa, sempre falso. Vai no FIM da lista de colunas,
-- que é o único jeito de `create or replace view` aceitar coluna nova.
--
-- Os dois passos da 0077 continuam: security_invoker e sem leitura do anon.

create or replace view public.pessoas_do_corretor as
 SELECT 'c:'::text || c.id::text AS pessoa_id,
    c.id AS conversa_id,
    c.lead_id,
    c.corretor_id,
    COALESCE(NULLIF(btrim(l.nome), ''::text), NULLIF(btrim(c.nome_cliente), ''::text)) AS nome,
    COALESCE(NULLIF(btrim(l.telefone), ''::text), c.telefone_cliente) AS telefone,
    l.etapa,
    GREATEST(c.ultima_interacao_em, c.created_at) AS ultima_atividade,
    c.ultima_mensagem AS previa,
    COALESCE(c.nao_lidas, 0) AS nao_lidas,
    true AS tem_conversa,
    EXISTS (
      SELECT 1 FROM whatsapp_mensagens m
       WHERE m.conversa_id = c.id AND m.remetente = 'cliente'
    ) AS conversou
   FROM whatsapp_conversas c
     LEFT JOIN leads l ON l.id = c.lead_id
  WHERE (l.id IS NULL OR l.arquivado_em IS NULL) AND c.lead_id IS NOT NULL
UNION ALL
 SELECT 'l:'::text || l.id::text AS pessoa_id,
    NULL::uuid AS conversa_id,
    l.id AS lead_id,
    l.corretor_id,
    NULLIF(btrim(l.nome), ''::text) AS nome,
    NULLIF(btrim(l.telefone), ''::text) AS telefone,
    l.etapa,
    l.created_at AS ultima_atividade,
    NULL::text AS previa,
    0 AS nao_lidas,
    false AS tem_conversa,
    false AS conversou
   FROM leads l
  WHERE l.arquivado_em IS NULL AND NOT (EXISTS ( SELECT 1
           FROM whatsapp_conversas c
          WHERE c.lead_id = l.id));

alter view public.pessoas_do_corretor set (security_invoker = on);
revoke select on public.pessoas_do_corretor from anon;
