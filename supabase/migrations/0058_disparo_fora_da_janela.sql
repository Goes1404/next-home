-- Campanha que ignora a janela de horário comercial.
--
-- A regra da casa continua sendo a de `antiBan.ts`: contato frio só sai
-- entre 9h e 20h59, de segunda a sábado, porque mensagem de campanha às 3h
-- é a assinatura mais clara de robô que existe. Esta coluna é a EXCEÇÃO
-- explícita, pedida pelo corretor caso a caso — nunca o padrão.
--
-- Por que uma coluna na campanha e não uma configuração global: a exceção
-- precisa ser auditável. Com um interruptor global ninguém saberia, depois,
-- QUAIS mensagens saíram de madrugada; com a marca na campanha, o histórico
-- responde sozinho.
--
-- O que esta coluna NÃO afrouxa, de propósito:
--   * o espaçamento de 35-75s entre disparos (`montarFilaCampanha`);
--   * a cota diária da curva de aquecimento (`limiteDiarioCampanha`);
--   * o disjuntor de falhas seguidas (`deveAbrirDisjuntor`).
-- Essas três são o que de fato protege o número. A janela de horário
-- protege a REPUTAÇÃO junto ao destinatário, que é outra coisa: quem
-- recebe oferta às 3h denuncia.
alter table public.whatsapp_campanhas
  add column if not exists ignorar_janela boolean not null default false;

comment on column public.whatsapp_campanhas.ignorar_janela is
  'true = esta campanha dispara em qualquer horário, inclusive madrugada e domingo. Exceção pedida pelo corretor; o espaçamento, a cota diária e o disjuntor continuam valendo.';

-- Sem grant explícito: diferente de `leads` (0007), esta tabela nunca
-- passou por `revoke update`, então os privilégios são de TABELA e a
-- coluna nova já nasce coberta. Conferido em information_schema.column_privileges
-- antes de escrever esta migration.
