-- 0039 — Palavra-chave de TESTE, irmã da de ativação.
--
-- A 0038 separou o histórico de teste do que será atendimento real, e
-- fechou a torneira do playground e do eval. Sobrou o caso do meio: o
-- corretor testando pelo WhatsApp de verdade, que entra como
-- `origem = 'webhook'` e nasce marcado como REAL — envenenando o few-shot
-- de novo, que é exatamente o problema que a 0038 acabou de limpar.
--
-- A solução cabe no gesto que ele já faz. Em vez de um botão numa tela que
-- ninguém abre no meio de um teste, uma segunda palavra digitada no
-- próprio chat:
--
--   palavra_chave_ativacao  → liga a IA. Conversa vale como real.
--   palavra_chave_teste     → liga a IA E marca a conversa como teste.
--
-- A de teste ATIVA também, de propósito: exigir as duas palavras faria o
-- corretor esquecer uma delas, e a que ele esqueceria é justamente a que
-- protege o corpus.
--
-- Uma vez marcada, a conversa continua sendo teste. Conversa usada para
-- testar já está contaminada — mensagens "Teste", repetição proposital,
-- cliente que é o próprio corretor fingindo. Nada disso vira exemplo bom
-- depois.

alter table public.corretor_whatsapp_instancias
  add column if not exists palavra_chave_teste text;

comment on column public.corretor_whatsapp_instancias.palavra_chave_teste is
  'Palavra que o corretor digita no próprio chat para ATIVAR a IA e MARCAR a conversa como teste (e_teste). Irmã de palavra_chave_ativacao, que ativa sem marcar.';

-- Reversão:
--   alter table public.corretor_whatsapp_instancias drop column palavra_chave_teste;
