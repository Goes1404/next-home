-- 0137: o catálogo conferido imagem por imagem (02/10/2026)
--
-- Pedido: "tem alguns imóveis que não estão com os cadastros completos".
-- Medido antes: 44 plantas publicadas sem metragem, várias com dormitórios
-- chutados pela importação; 10 imóveis sem lazer; 4 sem descrição.
--
-- PLANTAS: as 40 imagens foram abertas uma a uma. A metragem, o nome e os
-- dormitórios vêm do que está ESCRITO na planta (ou na legenda da imagem no
-- site da construtora). Sete linhas não eram planta de apartamento
-- (implantação, pavimento, rooftop, andar de baixo de duplex, foto de
-- living, lâmina de diferenciais): a remoção está na 0138. Os filtros `area_privativa is
-- null` fazem a migration não mexer em nada que alguém já tenha corrigido.
--
-- TEXTOS: só o que a página oficial do empreendimento diz. Nenhuma página
-- publica data de entrega, então entrega continua vazia. Endereço sem
-- número quando a fonte (a descrição do próprio cadastro) não tem número.
--
-- Descrição só é escrita onde a atual tem menos de 200 caracteres.
--
-- APLICADA EM PARTES (0137a a 0137g na tabela de histórico do Supabase): a
-- chamada inteira era cancelada pela ferramenta. As REMOÇÕES ficaram de
-- fora pelo mesmo motivo e estão na 0138, para rodar no editor SQL.

-- Mídias que estavam como planta sem ser planta (antes de apagar as linhas).
-- Duas "plantas" eram fotos do living: voltam para a galeria.
update public.midias set tipo = 'foto'
 where tipo = 'planta' and url in (select planta_url from public.tipologias where id::text like '0d4cbdbe%' or id::text like 'c2e070f8%');

-- Plantas: metragem e dados lidos na imagem.
update public.tipologias set area_privativa = 99, nome = '2 suítes e lavabo', dormitorios = 2, suites = 2, vagas = 2 where id::text like '153b9519%' and area_privativa is null;
update public.tipologias set area_privativa = 44, nome = '1 dormitório', dormitorios = 1, suites = 0, vagas = 1 where id::text like '07b03eed%' and area_privativa is null;
update public.tipologias set area_privativa = 41, nome = '1 dormitório (opção decorado)', dormitorios = 1, suites = 0, vagas = 1 where id::text like 'df9f089b%' and area_privativa is null;
update public.tipologias set area_privativa = 299, nome = '3 suítes c/ cozinha fechada (decorado)', dormitorios = 3, suites = 3, vagas = 3 where id::text like '92a8e4ce%' and area_privativa is null;
update public.tipologias set area_privativa = 246, nome = '2 suítes c/ cozinha aberta (living ampliado)', dormitorios = 2, suites = 2, vagas = 3 where id::text like '08f8a5f9%' and area_privativa is null;
update public.tipologias set area_privativa = 188, nome = '3 suítes c/ cozinha aberta (living ampliado)', dormitorios = 3, suites = 3, vagas = 3 where id::text like '90764d5b%' and area_privativa is null;
update public.tipologias set area_privativa = 299, nome = '4 suítes c/ cozinha fechada', dormitorios = 4, suites = 4, vagas = 3 where id::text like '71f7100d%' and area_privativa is null;
update public.tipologias set area_privativa = 188, nome = '3 suítes c/ cozinha fechada', dormitorios = 3, suites = 3, vagas = 3 where id::text like '4227d3c9%' and area_privativa is null;
update public.tipologias set area_privativa = 120, nome = '2 suítes (living ampliado)', dormitorios = 2, suites = 2, vagas = 2 where id::text like '920061bd%' and area_privativa is null;
update public.tipologias set area_privativa = 120, nome = '3 suítes', dormitorios = 3, suites = 3, vagas = 2 where id::text like '58c11713%' and area_privativa is null;
update public.tipologias set area_privativa = 67, nome = '1 suíte ampliada + lavabo', dormitorios = 1, suites = 1, vagas = 1 where id::text like 'd8304cca%' and area_privativa is null;
update public.tipologias set area_privativa = 84, nome = '2 suítes + lavabo', dormitorios = 2, suites = 2, vagas = 1 where id::text like '02e6b236%' and area_privativa is null;
update public.tipologias set area_privativa = 230, nome = 'Penthouse duplex · 3 suítes com piscina privativa', dormitorios = 3, suites = 3 where id::text like '7c28eb11%' and area_privativa is null;
update public.tipologias set area_privativa = 230, nome = '3 suítes', dormitorios = 3, suites = 3, vagas = 3 where id::text like '2b55efd2%' and area_privativa is null;
update public.tipologias set area_privativa = 340, nome = '4 suítes', dormitorios = 4, suites = 4, vagas = 4 where id::text like '33de5c18%' and area_privativa is null;
update public.tipologias set area_privativa = 273, nome = '3 suítes + living ampliado + banho Sr. e Sra.', dormitorios = 3, suites = 3 where id::text like 'df1a973f%' and area_privativa is null;
update public.tipologias set area_privativa = 273, nome = '3 suítes + living ampliado + cozinha aberta (decorado)', dormitorios = 3, suites = 3 where id::text like '9228597d%' and area_privativa is null;
update public.tipologias set area_privativa = 273, nome = '4 suítes + cozinha fechada', dormitorios = 4, suites = 4 where id::text like 'b87d469f%' and area_privativa is null;
update public.tipologias set area_privativa = 529, nome = 'Duplex · 4 suítes + terraço descoberto', dormitorios = 4, suites = 4 where id::text like 'e7e8dfa2%' and area_privativa is null;
update public.tipologias set area_privativa = 79, nome = '2 dormitórios, 1 suíte (living ampliado)', dormitorios = 2, suites = 1 where id::text like 'fbc3b1fb%' and area_privativa is null;
update public.tipologias set area_privativa = 79, nome = '3 dormitórios, 1 suíte', dormitorios = 3, suites = 1 where id::text like 'ed7ba7ba%' and area_privativa is null;
update public.tipologias set area_privativa = 56, nome = '1 dormitório (living ampliado)', dormitorios = 1, suites = 1 where id::text like 'b223d3d5%' and area_privativa is null;
update public.tipologias set area_privativa = 56, nome = '2 dormitórios, 2 banheiros', dormitorios = 2, suites = 0 where id::text like '6290655b%' and area_privativa is null;
update public.tipologias set area_privativa = 116, nome = '2 suítes + escritório (ampliada)', dormitorios = 2, suites = 2 where id::text like '31eb85c5%' and area_privativa is null;
update public.tipologias set area_privativa = 94, nome = '2 suítes + lavabo', dormitorios = 2, suites = 2 where id::text like '1fc01177%' and area_privativa is null;
update public.tipologias set area_privativa = 116, nome = '3 suítes + lavabo', dormitorios = 3, suites = 3 where id::text like 'fa1e3503%' and area_privativa is null;
update public.tipologias set area_privativa = 122 where id::text like 'f51fa76c%' and area_privativa is null;
update public.tipologias set area_privativa = 81, nome = '3 dormitórios, 1 suíte', dormitorios = 3, suites = 1 where id::text like '13c18198%' and area_privativa is null;
update public.tipologias set area_privativa = 63, nome = '2 dormitórios, 1 suíte', dormitorios = 2, suites = 1 where id::text like '6af2e552%' and area_privativa is null;
update public.tipologias set area_privativa = 48, nome = '1 dormitório + home office', dormitorios = 1, suites = 0, vagas = 1 where id::text like '42a5cb4d%' and area_privativa is null;
update public.tipologias set area_privativa = 58, nome = '2 dormitórios, 2 banheiros', dormitorios = 2, suites = 0, vagas = 1 where id::text like '27bc5ebb%' and area_privativa is null;
update public.tipologias set area_privativa = 71, nome = '3 dormitórios, 1 suíte', dormitorios = 3, suites = 1, vagas = 2 where id::text like '9491552e%' and area_privativa is null;
update public.tipologias set area_privativa = 49, nome = '1 dormitório', dormitorios = 1, suites = 0, vagas = 1 where id::text like '2accaf87%' and area_privativa is null;
update public.tipologias set area_privativa = 60, nome = '2 dormitórios, 1 suíte', dormitorios = 2, suites = 1, vagas = 1 where id::text like '93b5f4e7%' and area_privativa is null;

-- Copa 18 do Forte: "120 m² – 2 ou 3 suítes | 2 vagas" (página da J Almeida Matos).
do $$
declare v_id uuid;
begin
  select id into v_id from public.empreendimentos where slug = 'copa-18-do-forte';
  if v_id is null or exists (select 1 from public.tipologias where empreendimento_id = v_id) then return; end if;
  insert into public.tipologias (empreendimento_id, nome, area_privativa, dormitorios, suites, vagas, ordem) values
    (v_id, '2 suítes', 120, 2, 2, 2, 1),
    (v_id, '3 suítes', 120, 3, 3, 2, 2);
end $$;

-- Descrições, construtora, endereço e coordenada.
update public.empreendimentos set descricao = 'O Acervo Apartments é um lançamento da Construtora Dubai na Avenida Andrômeda, 946, em Alphaville Conde I, Barueri. As plantas vão de 41 m² e 44 m², com 1 dormitório e 1 vaga, a 99 m², com 2 suítes, lavabo e 2 vagas.

As áreas comuns são entregues equipadas e decoradas, com piscina, academia, espaço gourmet, coworking e lavanderia coletiva. Os apartamentos têm infraestrutura para ar-condicionado e bancadas de cozinha e banheiro em pedra natural. O estande de vendas fica na Alameda Centauro, 793.', construtora = coalesce(construtora, 'Construtora Dubai') where slug = 'acervo-apartments' and coalesce(length(descricao),0) < 200;
update public.empreendimentos set descricao = 'O Acervo Residences é um edifício da Construtora Dubai em construção na Alameda Centauro, 793, em Alphaville, Barueri. São apartamentos de 188 a 299 m², de 2 a 4 suítes, todos com 3 vagas e depósito privativo.

As plantas de 188 m² e 299 m² têm versão com cozinha fechada e versão com living ampliado e cozinha aberta. Todas trazem hall social privativo, terraço gourmet nivelado com a sala e infraestrutura para churrasqueira a carvão ou a gás.', construtora = coalesce(construtora, 'Construtora Dubai') where slug = 'acervo-residences' and coalesce(length(descricao),0) < 200;
update public.empreendimentos set descricao = 'O Authoria por Dubai está em construção na Avenida Copacabana, 500, no Empresarial 18 do Forte, em Alphaville, Barueri. São apartamentos de 273 m², com 3 ou 4 suítes, e duplex de 529 m² com 4 suítes, piscina e terraço descoberto. Todas as unidades têm depósito privativo, e há opções com até 5 vagas.

O lazer tem piscina com pérgola e raia de 25 m, piscina descoberta com solário, VIP space com churrasqueira e jacuzzi, apoio externo para festas, brinquedoteca e playground. As áreas comuns são entregues equipadas, decoradas e com ar-condicionado.' where slug = 'authoria-por-dubai' and coalesce(length(descricao),0) < 200;
update public.empreendimentos set descricao = 'O Andrômeda by MPD está em construção na Avenida Andrômeda, 328, em Alphaville, Barueri. São apartamentos de cerca de 90 m² e 120 m², com 2 ou 3 suítes, 2 vagas e depósito privativo em todas as unidades.

O lazer tem piscina adulto com raia de 25 m e piscina infantil, quadra de beach tennis, quadra de pickleball, quadra recreativa, fitness interno e externo, sauna, espaço de massagem e beauty, salão de festas, espaço gourmet, sport bar, churrasqueira, coworking com sala de reunião, brinquedoteca, playgrounds kids e baby e pet place.', construtora = coalesce(construtora, 'MPD Engenharia') where slug = 'andromeda-by-mpd' and coalesce(length(descricao),0) < 200;
update public.empreendimentos set descricao = 'O Arborium Alphagran é um lançamento de alto padrão da JMF no Alphagran, em Alphaville. São apartamentos de 230 m², com 3 suítes e 3 vagas, e de 340 m², com 4 suítes e 4 vagas, além de penthouses duplex com piscina privativa no terraço.

As unidades têm elevador privativo e de 24 a 33 metros de vista linear no living. O lazer reúne piscina externa e piscina coberta, spa com saunas, VIP space, quadra de tênis, academia, playground e salão de festas. O decorado fica na Alameda Washington, 173.' where slug = 'arborea-alphagran' and coalesce(length(descricao),0) < 200;
update public.empreendimentos set descricao = 'O Beyond Residence é um lançamento da RSF Empreendimentos em construção na Avenida Piraíba, 433, em Alphaville. São duas torres de 31 pavimentos, com apartamentos de 43 a 79 m², de 1 a 3 dormitórios.

O lazer tem piscina adulto, beach tennis, quadra poliesportiva, academia e sala de ginástica, sports bar, churrasqueira, salão de festas, espaço family, brinquedoteca, playground, coworking, pet place, bicicletário e mini market. As áreas comuns são entregues equipadas e decoradas.' where slug = 'beyond-residence' and coalesce(length(descricao),0) < 200;
update public.empreendimentos set endereco = 'Alameda Centauro, 793 – Alphaville, Barueri' where slug = 'acervo-residences' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Avenida Andrômeda, 328 – Alphaville, Barueri' where slug = 'andromeda-by-mpd' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Rua Luiz Scott – Jardim Iracema, Barueri' where slug = 'more-na-aldeia-de-barueri-mac238' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Rua Dempachi Nakayama – Jardim Esperança, Barueri' where slug = '3-dormitorios-com-suite-e-2-vagas-blsp634' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Rua Pereira Barreto – Munhoz Júnior, Osasco' where slug = 'vila-eco-park-mj605' and coalesce(endereco,'') = '';
update public.empreendimentos set nome = 'Andrômeda by MPD' where slug = 'andromeda-by-mpd' and nome = 'Andromêda by MPD';
update public.empreendimentos set lat = -23.4836691, lng = -46.8665853 where slug = 'acervo-residences' and lat is null;

-- Lazer listado na página oficial (ou nas legendas das fotos dela).
do $$
declare v_id uuid; v_lazer uuid; n text; r record;
begin
  for r in select * from (values
    ('acervo-apartments', array['Piscina', 'Academia', 'Espaço gourmet', 'Coworking', 'Lavanderia coletiva']),
    ('authoria-por-dubai', array['Piscina com raia de 25 m', 'Piscina descoberta', 'Solário', 'VIP space', 'Churrasqueira', 'Jacuzzi', 'Espaço para festas', 'Brinquedoteca', 'Playground']),
    ('andromeda-by-mpd', array['Piscina adulto', 'Piscina infantil', 'Quadra de beach tennis', 'Quadra de pickleball', 'Quadra recreativa', 'Fitness', 'Fitness externo', 'Sauna', 'Espaço de massagem', 'Espaço beauty', 'Salão de festas', 'Espaço gourmet', 'Sport bar', 'Churrasqueira', 'Coworking', 'Sala de reunião', 'Brinquedoteca', 'Playground', 'Playground baby', 'Pet place', 'Lounges externos']),
    ('arborea-alphagran', array['Piscina externa', 'Piscina coberta', 'Spa com saunas', 'VIP space', 'Quadra de tênis', 'Fitness', 'Playground', 'Salão de festas', 'Lounge externo']),
    ('beyond-residence', array['Piscina adulto', 'Beach tennis', 'Quadra poliesportiva', 'Academia', 'Sala de ginástica', 'Sports bar', 'Churrasqueira', 'Salão de festas', 'Espaço family', 'Brinquedoteca', 'Playground', 'Coworking', 'Pet place', 'Bicicletário', 'Mini market']),
    ('copa-18-do-forte', array['Piscina no rooftop', 'Jacuzzi', 'Lounge gourmet', 'Salão de festas', 'Academia', 'Fitness externo', 'Brinquedoteca', 'Espaço beauty', 'Quadra recreativa'])
  ) as t(slug, itens) loop
    select id into v_id from public.empreendimentos where slug = r.slug;
    continue when v_id is null;
    foreach n in array r.itens loop
      select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
      if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
      insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
      v_lazer := null;
    end loop;
  end loop;
end $$;
