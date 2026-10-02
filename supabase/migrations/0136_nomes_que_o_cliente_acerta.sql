-- 0136: nomes que o cliente acerta (02/10/2026)
--
-- Medido passando frases reais pelo reconhecimento de imóvel
-- (`imoveisCitados`, src/lib/whatsapp/focoDaConversa.ts) com os nomes do
-- catálogo de produção:
--
--   "me fala do royal barueri"  -> caía no Royal Barueri II. O Royal I estava
--       cadastrado com um título de anúncio ("Royal Barueri - Shopping
--       Barueri - Apartamento 1 a 3 Dorms"), único nome publicado que ainda
--       é anúncio. Passa a ser "Royal Barueri"; o slug não muda.
--   "vitta"  -> virava o Vitra Alphaville. A palavra "vitta" é pulada por
--       ficar a uma letra de "vista" (palavra comum), e a busca aproximada
--       achava o Vitra. O rótulo inteiro do apelido é sempre registrado.
--   "Joy"    -> registro comercial só: o reconhecimento exige 4 letras de
--       propósito, então "joy" sozinho continua sem virar foco. "Joy
--       Barueri" é reconhecido pelo nome inteiro.
--   "Copa 18" -> com "copa" e "forte" agora na lista de palavras comuns (o
--       cômodo e o bairro 18 do Forte viravam foco nele), o apelido curto é
--       o que mantém o imóvel reconhecível.
--   "viva jaguaribe" -> só a maiúscula do nome que aparece no site.
--
-- Os apelidos SOMAM aos que já existem (nunca substituem): o corretor pode
-- ter cadastrado outros pela tela.

update public.empreendimentos set nome = 'Royal Barueri'
 where slug = 'royal-barueri-shopping-barueri-apartamento-1-a-3-dorms-rb111';

update public.empreendimentos set nome = 'Viva Jaguaribe'
 where slug = 'apartamento-1-ou-2-dorms-39-m2-vvj710' and nome = 'viva jaguaribe';

update public.empreendimentos e
   set nomes_alternativos = array(
         select distinct x from unnest(coalesce(e.nomes_alternativos, '{}') || v.novos) x
       )
  from (values
         ('vitta-barueri', array['Vitta']),
         ('joy-barueri', array['Joy']),
         ('copa-18-do-forte', array['Copa 18'])
       ) as v(slug, novos)
 where e.slug = v.slug;
