-- 0188: texto da prévia do link do corretor (19/10/2026).
--
-- Pedido do dono: o link do portfólio que o corretor manda no WhatsApp
-- aparecia com "Portfólio de Imóveis de Alto Padrão em Alphaville", e não é
-- isso que a casa vende. O padrão passou a ser "Portfólio de <nome>" com a
-- descrição "Portfólio de produtos", e o corretor pode escrever o próprio
-- texto em "Meu perfil".
--
-- O que muda no banco:
--   1. `corretores.chamada_do_link`: texto da descrição da prévia, até 160
--      caracteres. Nulo = usa o padrão.
--   2. Grant de UPDATE só nesta coluna para `authenticated` (a tabela tem
--      grant por coluna desde a 0006; sem ele a policy "corretor edita o
--      proprio cadastro" passa e o update afeta 0 linhas, calado). A policy
--      continua sendo a da 0006: cada um edita só a própria linha.
--   3. Grant de SELECT na coluna para `anon`: a prévia é pública por
--      natureza e o site a lê pela chave publicável. Hoje o `anon` já tem
--      SELECT de tabela; o grant por coluna deixa a leitura valendo também
--      quando a leitura pública passar a ser por coluna (0187, outra branch,
--      ainda não publicada: ao juntar, `chamada_do_link` precisa entrar na
--      lista de colunas públicas e no grant de lá, porque o `revoke select`
--      de tabela leva junto os grants por coluna).
--
-- Aditiva: o código antigo não conhece a coluna e segue igual. O código novo
-- tolera a coluna ausente (lê à parte e ignora o erro), mas o campo de
-- "Meu perfil" só salva depois desta migration. Ordem: migration, deploy.

begin;

set local lock_timeout = '5s';

alter table public.corretores
  add column if not exists chamada_do_link text;

alter table public.corretores
  drop constraint if exists corretores_chamada_do_link_tamanho;

alter table public.corretores
  add constraint corretores_chamada_do_link_tamanho
  check (chamada_do_link is null or char_length(chamada_do_link) between 1 and 160);

comment on column public.corretores.chamada_do_link is
  'Descrição da prévia do link do portfólio no WhatsApp (0188). Nulo = "Portfólio de produtos".';

grant update (chamada_do_link) on public.corretores to authenticated;
grant select (chamada_do_link) on public.corretores to anon, authenticated;

commit;
