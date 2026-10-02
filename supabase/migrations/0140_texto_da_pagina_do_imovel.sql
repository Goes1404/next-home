-- 0140 — Texto da página do imóvel (02/10/2026)
--
-- Achado avaliando a página pública do imóvel. Só corrige o que está ERRADO
-- ou se contradiz; nada aqui acrescenta fato que não estava no cadastro ou
-- na fonte citada.
--
--   Dellagio     O endereço era o do ESCRITÓRIO da Atria ("Calçada das
--                Paineiras, 19 — Centro Comercial", o "Onde estamos" do site
--                dela). O prédio fica na Avenida Ômega, 238, 18 do Forte
--                (atriaincorporadora.com.br/dellagio e apto.vc). O pino já
--                estava na Avenida Ômega; só o texto mentia, e levaria o
--                cliente ao lugar errado pelo "Como chegar".
--   Breeze       A descrição dizia "a partir de R$ 289.000,00" e o topo da
--                página, R$ 349.900 (o preço cadastrado). Dois preços na
--                mesma página: sai o da descrição.
--   Bless Parque Mesma coisa: "a partir de R$ 450.000,00" na descrição contra
--                R$ 630.000 cadastrado.
--   APV          Descrição inteira em CAIXA ALTA, em frases de anúncio.
--                Reescrita com os mesmos fatos.
--   On The Park  "Ultimas Unidade" (sem acento, sem plural) no título e na
--                descrição. Reescrita com os mesmos fatos.
--   Bit, Griffe  Frase de destaque em caixa alta (e "INCOPORADORA").
--
-- As frases coladas ("Osasco!Descubra") e a frase de destaque que repete a
-- descrição são tratadas na leitura (src/lib/imoveis/textoDoCadastro.ts),
-- para valer também para o que vier de importação depois.

update public.empreendimentos
   set endereco = 'Avenida Ômega, 238 – Empresarial 18 do Forte, Barueri'
 where slug = 'dellagio-alphaville'
   and endereco like 'Calçada das Paineiras%';

update public.empreendimentos
   set descricao = replace(replace(replace(replace(descricao,
         'Localizado no Jardim Júlio, Barueri/SP, Apartamentos na planta com Área total de 43mt² ,48mt, 58m, 65mt e 72mt, pelo valor a partir de R$ 289.000,00, sendo 1,2 e 3 dormitórios.',
         'Localizado no Jardim Júlio, em Barueri, com apartamentos na planta de 43 m², 48 m², 58 m², 65 m² e 72 m², de 1, 2 e 3 dormitórios.'),
         'Diferenciais que tornam um Projeto unico:', 'Diferenciais do projeto:'),
         'espaços exclusivos,100%', 'espaços exclusivos, 100%'),
         'Ponto de Oníbus', 'Ponto de Ônibus')
 where slug = 'breeze-home-clube-bhc741';

update public.empreendimentos
   set descricao = replace(replace(replace(descricao,
         'Lançamento localizada na Rua Dempachi Nakayama, bairro Jardim Esperança, Barueri/SP proximo ao parque Barueri Apartamentos de 48mt, 58mt e 73mtpelo valor a partir de R$ 450.000,00, 2 e 3 dormitórios.',
         'Lançamento na Rua Dempachi Nakayama, no Jardim Esperança, em Barueri, próximo ao Parque Barueri. Apartamentos de 48 m², 58 m² e 73 m², de 2 e 3 dormitórios.'),
         'lazer no terreo e roftop', 'lazer no térreo e no rooftop'),
         'Ponto de Oníbus', 'Ponto de Ônibus')
 where slug = '3-dormitorios-com-suite-e-2-vagas-blsp634';

update public.empreendimentos
   set tagline = 'Apartamentos de 2 ou 3 suítes, com decorado para visitar',
       descricao = 'O Alpha Park View, da Danpriss, é um lançamento na Aldeia, em Barueri. São apartamentos de 2 ou 3 suítes, com 1 ou 2 vagas e lazer completo.'
         || E'\n\n' || 'Os decorados estão abertos para visita.'
 where slug = 'apartamento-ao-lado-do-shopping-apv668'
   and tagline = 'LANÇAMENTO NA REGIÃO !';

update public.empreendimentos
   set tagline = 'Últimas unidades, de 62 a 94 m²',
       descricao = 'O On The Park Alphaville, da CNL, está nas últimas unidades. São apartamentos de 62 a 94 m², com 1 a 3 suítes, em Alphaville.'
         || E'\n\n' || 'Há unidades nas torres Trianon e Ibirapuera.'
 where slug = 'on-the-park-alphaville-ne72055'
   and tagline = 'Ultimas Unidade do On The Park Alphaville';

update public.empreendimentos
   set tagline = '3 dormitórios com 2 suítes no Jardim São Silvestre',
       construtora = 'MINT Incorporadora'
 where slug = 'melhor-valor-de-metro-da-regiao-btb103'
   and tagline = 'LANÇAMENTO DA MINT INCOPORADORA';

update public.empreendimentos
   set tagline = '2 dormitórios com lazer completo no Votupoca'
 where slug = 'minha-casa-minha-vida-analise-de-credito-gratuita-ne78847'
   and tagline = 'APROVEITE CONDIÇÕES DO GRIFFE BARUERI';
