-- Login de corretor + atribuição de WhatsApp por link pessoal.
--
-- `user_id` liga a linha de `corretores` a uma conta do Supabase Auth (e-mail
-- + senha) — o corretor entra em /corretor e pega seu link pessoal
-- (?corretor=<slug>). `slug` é o identificador curto usado nesse link (em
-- vez do uuid de `id`, feio de compartilhar por WhatsApp).
--
-- `leads.corretor_id` registra qual corretor estava "ativo" (pelo link) no
-- momento em que o formulário de contato foi enviado, além do
-- `empreendimento_id` já existente — sem isso, um lead vindo pelo link de um
-- corretor mas sobre um empreendimento de outro dono ficaria sem crédito
-- correto de atribuição.

alter table corretores
  add column user_id uuid unique references auth.users(id) on delete set null,
  add column slug text unique;

alter table leads
  add column corretor_id uuid references corretores(id) on delete set null;

-- Sem novas policies de RLS: a leitura de `corretores` já é pública
-- ("corretores sao publicos", 0001_init.sql), e login não escreve na
-- própria linha — só lê `slug`/`user_id`. Escrita continua reservada ao
-- service role, mesmo padrão das demais tabelas.
