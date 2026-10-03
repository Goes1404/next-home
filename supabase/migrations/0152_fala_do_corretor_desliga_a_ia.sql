-- 0152: a fala do corretor DESLIGA a IA na conversa (03/10/2026).
--
-- Decisão do Matheus: a IA nunca mais responde uma conversa em que o
-- corretor falou, a não ser que seja ATIVADA de novo (palavra-chave no chat
-- ou "IA assume agora"). Antes a fala dele pausava a IA por 3h, e ela voltava
-- sozinha. No código, `desligarIaPorFalaDoCorretor` grava `bot_ativo = false`.
--
-- Esta migration aplica a regra ao que já existe: conversa com a IA ligada em
-- que o corretor falou DEPOIS da última resposta da IA é uma conversa que ele
-- assumiu — a IA sai dela. Medido antes de escrever: 5 conversas.
--
-- `pausado_humano_ate` deixa de ser lido pelo código; zerá-lo evita que um
-- valor velho pareça pausa a quem olhar o banco.

update public.whatsapp_conversas c
set bot_ativo = false
where c.bot_ativo
  and exists (
    select 1
    from public.whatsapp_mensagens m
    where m.conversa_id = c.id
      and m.remetente = 'corretor'
      and m.created_at > coalesce(
        (select max(b.created_at) from public.whatsapp_mensagens b
          where b.conversa_id = c.id and b.remetente = 'bot'),
        '-infinity'::timestamptz
      )
  );

update public.whatsapp_conversas set pausado_humano_ate = null where pausado_humano_ate is not null;

comment on column public.whatsapp_conversas.pausado_humano_ate is
  'Sem uso desde 0152 (03/10/2026): a fala do corretor desliga a IA (bot_ativo = false) em vez de pausar.';
