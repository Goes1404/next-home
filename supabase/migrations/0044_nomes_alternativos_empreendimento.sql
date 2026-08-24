-- O nome que o CLIENTE usa não é o nome que está no cadastro.
--
-- Medido nas conversas de produção em 24/08/2026:
--
--   "Gostaria de informações do Dom parque"   → cadastro: "Lançamento ao Lado do Parque"
--   "Quero informações do manacá Barueri"     → cadastro: "More na Aldeia de Barueri"
--
-- Os dois SÃO imóveis nossos. O `nome` do cadastro é título de anúncio
-- ("Lançamento ao Lado do Parque", "Melhor valor de metro da Região") e o
-- cliente chama o empreendimento pelo nome comercial, que só aparece no
-- meio da descrição. Resultado: o bot trata como imóvel de outra
-- imobiliária e a conversa vira sugestão genérica.
--
-- Nenhuma correção de grafia resolve isso — "Dom Parque" e "Lançamento ao
-- Lado do Parque" não são a mesma palavra escrita errado, são nomes
-- diferentes. E casar contra a descrição inteira seria pior que o defeito:
-- ela carrega bairro, cidade e construtora, então "Barueri" ou "Jardim
-- Tupanci" fariam o bot focar no imóvel errado — e foco errado AFIRMA
-- coisas sobre o imóvel.
--
-- Por isso o apelido vira dado explícito, que o corretor controla na tela
-- do imóvel. Serve ao bot (`focoDaConversa.ts`, `catalogoRelevante.ts`) e
-- também à busca do site.

alter table public.empreendimentos
  add column if not exists nomes_alternativos text[] not null default '{}';

comment on column public.empreendimentos.nomes_alternativos is
  'Como o cliente chama este imóvel: nome comercial, nome da construtora para o produto, apelido de anúncio. Usado para reconhecer o imóvel citado no WhatsApp.';

-- Backfill do que já foi medido em conversa real. Os três cadastros com o
-- mesmo nome são o mesmo empreendimento anunciado três vezes; todos
-- recebem o apelido, e o desempate entre eles é do código.
update public.empreendimentos
   set nomes_alternativos = array['Dom Parque']
 where nome = 'Lançamento ao Lado do Parque'
   and nomes_alternativos = '{}';

update public.empreendimentos
   set nomes_alternativos = array['Manacá', 'Manacá Barueri']
 where slug = 'more-na-aldeia-de-barueri-mac238'
   and nomes_alternativos = '{}';
