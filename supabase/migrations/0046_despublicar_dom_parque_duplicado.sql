-- O mesmo empreendimento estava publicado TRÊS vezes.
--
-- "Lançamento ao Lado do Parque" (o Dom Parque, da P4 Engenharia, no Jardim
-- Tupanci) tinha três cadastros criados no mesmo dia 08/08/2026, com a
-- MESMA descrição de 1776 caracteres e 4 mídias cada. Nenhum deles tinha
-- lead, campanha ou tipologia vinculada — são cópias, não variações.
--
-- Isso aparecia em dois lugares: no site, como três imóveis distintos na
-- vitrine; e no bot, como um nome que aponta para três slugs, ou seja,
-- ambíguo. O código já lida com o segundo caso (cadastros gêmeos se fundem
-- no mais completo, ver `focoDaConversa.ts`), mas isso é rede de segurança
-- para um problema de dado — e o dado se conserta aqui.
--
-- DESPUBLICAR, não apagar: a leitura pública já filtra `publicado = true`
-- (RLS da 0001), então sair do ar é imediato e completo. Apagar destruiria
-- as linhas de `midias` por cascade e deixaria os arquivos órfãos no
-- bucket, sem ganho nenhum — e é irreversível.
--
-- Fica publicado o cadastro mais antigo (`...ne51970`, 23:28:48).

update public.empreendimentos
   set publicado = false,
       updated_at = now()
 where slug in (
   'lancamento-ao-lado-do-parque-ne93837',
   'lancamento-ao-lado-do-parque-ne38370'
 );
