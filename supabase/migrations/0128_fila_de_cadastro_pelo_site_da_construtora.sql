-- 0128 — os 14 imóveis da fila de cadastro, lidos do site de cada construtora.
--
-- Entram como RASCUNHO (publicado = false): nada aparece no site nem para a
-- assistente até o corretor conferir e publicar. Cada ficha foi montada com
-- o que a PÁGINA DA CONSTRUTORA publica (link em site_construtora, que o
-- importador de fotos já usa para "Buscar novidades"). Onde o site dela não
-- diz, o campo fica vazio: preço e data de entrega NÃO vêm do agregador
-- (apto.vc), que divergiu da construtora em pelo menos dois casos (Liv Stay:
-- endereço e plantas; Dellagio: entrega). Coordenada só entra quando a rua
-- do agregador bate com a da construtora.
--
-- Fotos não entram por aqui: elas precisam passar por registrarMidia
-- (medida, blur, dedup por hash), que roda no painel, na aba Importar →
-- Site da construtora, com o link já preenchido.
--
-- Idempotente: pula o imóvel cujo slug já existe.

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'dellagio-alphaville') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('dellagio-alphaville', 'Dellagio Alphaville', array['Dellagio']::text[], 'Torre única no 18 do Forte, com lazer na cobertura', 'O Dellagio Alphaville é um edifício de torre única da Atria no 18 do Forte, em Alphaville. São 81 apartamentos em 15 pavimentos, de 95 m² a 117 m², todos com varanda gourmet, vagas demarcadas e depósito individual.

O lazer se divide em dois andares. No térreo: pet space, espaço multimídia, miniquadra, salão de jogos, brinquedoteca, playground e coworking. Na cobertura: piscina adulto com borda infinita, piscina infantil, raia aquecida e coberta, beauty spa com jacuzzi, sauna, área fitness com deck, salão de festas e salão gourmet.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Empresarial 18 do Forte', 'Avenida Ômega, 238 – 18 do Forte', -23.4848328, -46.8504011, 'Atria', 81, 1, 15, 'https://www.atriaincorporadora.com.br/dellagio/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '95 m² · 2 suítes', 2, 2, 2, 95, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '117 m² · 3 suítes', 3, 3, 2, 117, 1);
  foreach n in array array['Pet space','Espaço multimídia','Miniquadra','Salão de jogos','Brinquedoteca','Playground','Coworking','Piscina adulto com borda infinita','Piscina infantil','Raia aquecida e coberta','Beauty spa com jacuzzi','Sauna','Área fitness com deck','Salão de festas','Salão gourmet']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'tour360'::tipo_midia, 'https://kuula.co/share/collection/7XXGP', 'Tour virtual 360°', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'f6e79d2c-3ac8-4a66-987b-bcbbe59aa1ba';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'joy-barueri') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('joy-barueri', 'Joy Barueri', '{}'::text[], 'Apartamentos de 65 m² a 167 m², com opções duplex', 'O Joy Barueri é um residencial da Construtora Dubai na Rua Terra, no Jardim Tupanci, em Barueri. As plantas vão de 65 m² a 167 m², com opções duplex de 116 m² e 167 m² com terraço, e até 2 vagas.

O lazer inclui piscina adulto e infantil, churrasqueira, espaço gourmet, wine bar, praça do fogo, VIP space, sports bar, academia, quadra recreativa, coworking, salão de festas, brinquedoteca, playground e espaço delivery.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Jardim Tupanci', 'Rua Terra, 56 – Jardim Tupanci', -23.4930106, -46.8693525, 'Construtora Dubai', null, null, null, 'https://www.construtoradubai.com.br/escolha-seu-dubai/joy-barueri/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '65 m² · 2 suítes', 2, 2, 0, 65, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '85 m² · 3 dorms (1 suíte)', 3, 1, 0, 85, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Duplex 116 m²', 3, 0, 0, 116, 2);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Duplex 167 m²', 3, 0, 0, 167, 3);
  foreach n in array array['Piscina adulto','Piscina infantil','Churrasqueira','Espaço gourmet','Wine bar','Praça do fogo','VIP space','Sports bar','Academia','Quadra recreativa','Coworking','Salão de festas','Brinquedoteca','Playground','Espaço delivery']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=gwAm7_gAe1w', 'Vídeo do Joy Barueri', 50);
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=lQ01Ww-CmVA', 'Vídeo do Joy Barueri (2)', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '6879d477-230e-433f-aebe-b034cf4e5b4a';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'la-vista-barueri') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('la-vista-barueri', 'La Vista Barueri', array['La Vista Condomínio Clube']::text[], 'Condomínio clube num ponto alto de Barueri', 'O La Vista Condomínio Clube, da Faena, fica num ponto alto de Barueri, na Estrada Dr. Cícero Borges de Morais, com vista para a cidade. São apartamentos de 47 m² a 60 m², de 1 ou 2 dormitórios (com opção de suíte) e 1 ou 2 vagas.

Fica a poucos minutos do centro comercial, com acesso à Rodovia Castello Branco, à Estrada dos Romeiros e à Estrada dos Altos. O lazer tem piscina, churrasqueiras, fire place, beach tennis, quadra, playground, brinquedoteca, fitness, sauna, espaço beleza, coworking, salão de jogos, salões de festas e mini market.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Vila Universal', 'Estrada Dr. Cícero Borges de Morais, 3096 – Barueri', -23.5000731, -46.9051424, 'Faena', null, null, null, 'https://faenadomum.com.br/imoveis/la-vista-barueri-sp/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '47 m² a 60 m² · 1 ou 2 dorms', 2, 0, 1, null, 0);
  foreach n in array array['Piscina','Churrasqueira','Fire place','Beach tennis','Quadra','Playground','Brinquedoteca','Fitness','Sauna','Espaço beleza','Coworking','Salão de jogos','Salão de festas','Mini market']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '00e97e49-f2ff-419f-8a2a-e84eacd35c8c';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'liv-stay-residence') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('liv-stay-residence', 'Liv Stay Residence', array['Liv Stay']::text[], 'Para morar ou investir em Alphaville, de 32 m² a 112 m²', 'O Liv Stay Residence, da RSF, fica na Avenida Mackenzie, em Alphaville. Foi pensado para quem quer morar ou investir em locação: plantas de 32 m² a 112 m², com 1, 2 ou 3 dormitórios, em dois blocos, incluindo opções duplex.

A área comum tem praça de chegada, social lounge, gourmet lounge, grill, playground, spa, espaço reflexo, beach tennis, futmesa, piscina, wellness pool, sauna, pet club, salão de festas, brinquedoteca, mini market, lavanderia, coworking, sala gamer, sports bar, sky bar, sky gym e espaço podcast.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Alphaville', 'Avenida Mackenzie, 730 – Alphaville', null, null, 'RSF Empreendimentos', null, null, null, 'https://www.rsf.com.br/alphaville/liv-stay-residence/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '32 m²', 1, 0, 0, 32, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '35 m²', 1, 0, 0, 35, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '59 m²', 2, 0, 0, 59, 2);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Duplex 64 m²', 2, 0, 0, 64, 3);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '112 m²', 3, 0, 0, 112, 4);
  foreach n in array array['Praça de chegada','Social lounge','Gourmet lounge','Grill','Playground','Spa','Espaço reflexo','Beach tennis','Futmesa','Piscina','Wellness pool','Sauna','Pet club','Salão de festas','Brinquedoteca','Mini market','Lavanderia','Coworking','Sala gamer','Sports bar','Sky bar','Sky gym','Espaço podcast']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '2488a235-06e7-470b-80fa-aa076e31f559';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'nid-alphaville') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('nid-alphaville', 'NID Alphaville', array['NID']::text[], 'Refúgio urbano com lazer de clube em Alphaville', 'O NID Alphaville, da Plano&Plano, fica na Avenida Sylvio Honório Álvares Penteado, em Alphaville, perto do Shopping Iguatemi Alphaville. São quatro torres com apartamentos de 75 m² a 189 m², de 1 a 3 suítes e lavabo, incluindo gardens e duplex.

O lazer tem piscinas (inclusive coberta), casa de campo, acqua boulevard, beach tennis, quadra poliesportiva, quadra de tênis, churrasqueiras, sports bar, gourmet, salões de festas adulto e infantil, fitness, yoga e pilates, espaço funcional, wellness, massagem, beauty care, espaço teen, espaço influencer, coworking, pet place, pet care, mini mercado, delivery, brinquedoteca e playground.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Alphaville', 'Avenida Sylvio Honório Álvares Penteado, 206 – Alphaville', -23.5032771, -46.838333, 'Plano&Plano', null, 4, null, 'https://www.planoeplano.com.br/imoveis/sp/sao-paulo/apartamentos/alphaville/nid-alphaville', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '75 m² · 2 dorms', 2, 0, 0, 75, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '76 m² · 2 dorms (1 suíte)', 2, 1, 0, 76, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '86 m² · 3 dorms', 3, 0, 0, 86, 2);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Garden 93 m² · 2 dorms (1 suíte)', 2, 1, 0, 93, 3);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '107 m² · 4 dorms', 4, 0, 0, 107, 4);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Duplex 130 a 133 m² · 2 dorms', 2, 1, 0, 133, 5);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Duplex 153 m²', 3, 0, 0, 153, 6);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Duplex 189 m² · 4 dorms', 4, 0, 0, 189, 7);
  foreach n in array array['Piscina','Piscina coberta','Casa de campo','Acqua boulevard','Beach tennis','Quadra poliesportiva','Quadra de tênis','Churrasqueira','Sports bar','Espaço gourmet','Salão de festas','Salão de festas infantil','Fitness','Yoga e pilates','Espaço funcional','Wellness','Espaço massagem','Beauty care','Espaço teen','Espaço influencer','Coworking','Pet place','Pet care','Mini mercado','Espaço delivery','Brinquedoteca','Playground']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=UoEP9xQCwXA', 'Vídeo do NID Alphaville', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'bddc08ba-3d00-407f-9c6a-c621ab17b56f';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'nova-california') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('nova-california', 'Nova Califórnia', array['Nova California']::text[], 'Torre única com lazer de clube no Jardim Califórnia', 'O Nova Califórnia, da Quattro, é um condomínio fechado de torre única no Jardim Califórnia, em Barueri. Os apartamentos de 46 m² (aprovados como 1 dormitório mais escritório) têm terraço e 1 vaga; há também unidades garden.

O lazer de clube tem piscina adulto com deck molhado, piscina infantil, solário, espaço grill sob pérgolas com churrasqueira e forno à lenha, salão de festas, coworking, salão de jogos, brinquedoteca, fitness, espaço pet, quadra esportiva, playground e bicicletário. A região tem o Parque Municipal Dom José, a Arena Barueri e o Parque Shopping Barueri por perto.', 'lancamento'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Jardim Califórnia', 'Rua do Ouvidor – Jardim Califórnia', -23.4956175, -46.9029607, 'Quattro Construtora', null, 1, null, 'https://novacalifornia.com.br/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '46 m² · 1 dorm + escritório', 1, 0, 1, 46, 0);
  foreach n in array array['Piscina adulto com deck molhado','Piscina infantil','Solário','Espaço grill','Salão de festas','Coworking','Salão de jogos','Brinquedoteca','Fitness','Espaço pet','Quadra esportiva','Playground','Bicicletário']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'd3cbd101-2ee1-4049-8648-38f1d1ecc700';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'oasis-home-resort') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('oasis-home-resort', 'Oásis Home Resort', array['Oásis Alphaville','Oasis']::text[], 'Torre única inspirada em resort, no Alphagran', 'O Oásis Home Resort, da CNA Spitaletti com construção da P4 Engenharia, é uma torre única na Alameda Washington, no Alphagran, em Alphaville, faceada por 165 metros lineares de mata preservada. As plantas são de 74 m², 90 m² e 114 m², com 2 vagas.

O lazer tem mais de 850 m² de lâmina d''água, bangalôs, gourmet com piscina privativa, beach tennis, academia com mais de 300 m², lounge pet e espaço delivery, além de vagas com carga para carro elétrico.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Alphagran', 'Alameda Washington, 824 – Alphagran', -23.4887846, -46.8629491, 'CNA Spitaletti', null, 1, null, 'https://www.cnaspitaletti.com.br/empreendimentos/oasis', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '74 m² · 2 dorms', 2, 0, 2, 74, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '90 m² · 3 dorms', 3, 0, 2, 90, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '114 m²', 3, 0, 2, 114, 2);
  foreach n in array array['Bangalô','Lounge pet','Gourmet com piscina privativa','Beach tennis','Academia','Espaço delivery']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=KFXQClq8CHY', 'Vídeo do Oásis', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '88654dca-7bc6-4000-93db-b918e6623632';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'open-view-47') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('open-view-47', 'Open View 47', '{}'::text[], '3 suítes numa rua sem saída em Alphaville', 'O Open View 47, da Construtora Dubai, fica na Alameda Leblon, uma rua tranquila e sem saída em Alphaville, perto de tudo o que o dia a dia pede. Os apartamentos têm 119 m² e 120 m², 3 suítes, lavabo e 2 vagas.

O lazer tem piscina adulto, piscina infantil, piscina coberta com spa, churrasqueira gourmet, lareira, beach tennis, sports bar, academia, coworking, salão de festas, salão multiuso, VIP space, brinquedoteca, playground, pet place e delivery.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Alphaville', 'Alameda Leblon, 47 – Alphaville', -23.4841734, -46.8568929, 'Construtora Dubai', null, null, null, 'https://www.construtoradubai.com.br/escolha-seu-dubai/open-view-47/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '119 m² · 3 suítes', 3, 3, 2, 119, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '120 m² · 3 suítes', 3, 3, 2, 120, 1);
  foreach n in array array['Piscina adulto','Piscina infantil','Piscina coberta','Spa','Churrasqueira gourmet','Lareira','Beach tennis','Sports bar','Academia','Coworking','Salão de festas','Salão multiuso','VIP space','Brinquedoteca','Playground','Pet place','Espaço delivery']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=fb0sm8dfpJY', 'Vídeo do Open View 47', 50);
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=FV5X3G63_E4', 'Vídeo do Open View 47 (2)', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'a713dc7a-d133-4fdf-a237-959ec18a89c1';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'royal-barueri-ii') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('royal-barueri-ii', 'Royal Barueri II', array['Royal II']::text[], 'Segunda e última fase do neoclássico com lazer de resort', 'O Royal Barueri II é a segunda e última fase do Royal Barueri, da Spitaletti com a RSF, na Rua Rondônia, na Aldeia de Barueri. São 450 unidades em 2 torres, de 57 m² a 105 m², com 2 ou 3 dormitórios e 2 vagas.

O lazer de resort tem piscina principal, piscina coberta, spa piscina, piscina infantil com brinquedão, bar e lounge da piscina, espaço gourmet com piscina privativa, churrasqueira, salão de festas interno e externo, praça central, sauna, quadra, fitness, espaço games, sports bar, playground, brinquedoteca e pet care.', 'lancamento'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Aldeia', 'Rua Rondônia, 111 – Aldeia', -23.5161565, -46.8592569, 'CNA Spitaletti e RSF', 450, 2, null, 'https://www.cnaspitaletti.com.br/empreendimentos/royal-barueri-ii', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '57 m² · 2 dorms', 2, 0, 2, 57, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '74 m² · 3 dorms', 3, 0, 2, 74, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '79 m² · 2 suítes', 2, 2, 2, 79, 2);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '86 m²', 2, 0, 2, 86, 3);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '105 m² · 3 suítes', 3, 3, 2, 105, 4);
  foreach n in array array['Piscina','Piscina coberta','Spa piscina','Piscina infantil com brinquedão','Bar da piscina','Lounge piscina','Espaço gourmet com piscina privativa','Churrasqueira','Salão de festas','Salão de festas externo','Praça central','Sauna','Quadra','Fitness','Espaço games','Sports bar','Playground','Brinquedoteca','Pet care']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=Wn2PltTTR1c', 'Vídeo do Royal Barueri II', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'aaad44f5-03ed-4277-851e-a15f4755c921';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'serenne-barueri') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('serenne-barueri', 'Serenne Barueri', array['Serenne']::text[], 'Torre única com lazer completo no rooftop', 'O Serenne Barueri, da Zinco Residencial, é uma torre única na Rua Luis Scott, na Aldeia de Barueri. São 120 apartamentos de 49,51 m² e 53,10 m², com 1 ou 2 dormitórios (planta flexível), terraço gourmet, infraestrutura para ar-condicionado, preparo para casa inteligente e 1 ou 2 vagas.

O lazer fica no rooftop: piscina adulto e infantil com solarium, fitness, quadra esportiva, salão de festas gourmet, espaço grill com churrasqueira e forno de pizza, salão de jogos, brinquedoteca, playground, mini market e espaço delivery, entregues equipados e decorados.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Aldeia', 'Rua Luis Scott, 186 (esquina com a Rua Santo Estevão) – Aldeia', -23.5107435, -46.8606302, 'Zinco Residencial', 120, 1, 14, 'https://zincoresidencial.com.br/imovel/serenne-barueri/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Tipo B · 49,51 m²', 2, 0, 0, 49.51, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Tipo A · 53,10 m²', 2, 0, 0, 53.1, 1);
  foreach n in array array['Piscina adulto','Piscina infantil','Solarium','Fitness','Quadra esportiva','Salão de festas gourmet','Espaço grill','Salão de jogos','Brinquedoteca','Playground','Mini market','Espaço delivery']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'tour360'::tipo_midia, 'https://www.3dexplora.com.br/seutour.aspx?codigo=bF8axYuRuMP', 'Tour virtual 360°', 50);
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=sX4yZqF951A', 'Vídeo do Serenne Barueri', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'dcc3b025-8e23-4324-b772-3fc05994a65e';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'square-design-residence') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('square-design-residence', 'Square Design Residence', array['Square']::text[], '3 suítes no bairro mais gastronômico de Alphaville', 'O Square Design Residence, da RSF, é um projeto com referências internacionais no 18 do Forte, o bairro mais gastronômico de Alphaville. São plantas de 94 m² a 121 m² com 3 suítes, do 1º ao 40º pavimento, todas com depósito privativo.

As áreas comuns são entregues equipadas e decoradas: mini market, bicicletário, car wash, pet place, salão de festas, brinquedoteca, academia, sala de ginástica, coworking, piscina adulto, beach tennis, quadra poliesportiva, playground, churrasqueira, sports bar e espaço family.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Empresarial 18 do Forte', 'Avenida Verte Ville, 300 – 18 do Forte', null, null, 'RSF Empreendimentos', null, 1, 40, 'https://www.rsf.com.br/alphaville/square-design-residence/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '94 m² · 3 suítes', 3, 3, 0, 94, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '118 m² · 3 suítes', 3, 3, 0, 118, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '121 m² · 3 suítes', 3, 3, 0, 121, 2);
  foreach n in array array['Mini market','Bicicletário','Car wash','Pet place','Salão de festas','Brinquedoteca','Academia','Sala de ginástica','Coworking','Piscina adulto','Beach tennis','Quadra poliesportiva','Playground','Churrasqueira','Sports bar','Espaço family']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '97ce66ba-b40e-4f76-ab7a-3e66749402b3';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'symmetry-residence') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('symmetry-residence', 'Symmetry Residence', array['Symmetry']::text[], '2 ou 3 suítes, de 65 m² a 88 m², em torre única', 'O Symmetry Residence, da RSF, fica na Avenida Mackenzie, em Alphaville. É uma torre única com apartamentos de 65 m² a 88 m², de 2 ou 3 suítes, terraço gourmet e 2 ou 3 vagas, num terreno de 3.735 m².

O lazer completo tem piscina adulto e infantil, prainha, beach tennis, quadra poliesportiva, sauna, spa, solário, sky bar, lounge, praça da fogueira, horta, churrasqueira, sports gourmet, adega, salão de festas, academia, sala de ginástica, coworking, espaço beleza, espaço teens, espaço youtuber, espaço family, brinquedoteca, playground, pet place, car wash, bicicletário, mini market e delivery.', 'em_construcao'::status_obra, 'apartamento'::tipo_imovel, 'lancamento', 'Barueri', 'Alphaville', 'Avenida Mackenzie, 690 – Alphaville', -23.4872128, -46.8346413, 'RSF Empreendimentos', null, 1, null, 'https://www.rsf.com.br/alphaville/symmetry-residence/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '65 m² · 2 suítes', 2, 2, 2, 65, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '88 m² · 3 suítes', 3, 3, 2, 88, 1);
  foreach n in array array['Piscina adulto','Piscina infantil','Prainha','Beach tennis','Quadra poliesportiva','Sauna','Spa','Solário','Sky bar','Lounge','Praça da fogueira','Horta','Churrasqueira','Sports gourmet','Adega','Salão de festas','Academia','Sala de ginástica','Coworking','Espaço beleza','Espaço teens','Espaço youtuber','Espaço family','Brinquedoteca','Playground','Pet place','Car wash','Bicicletário','Mini market','Espaço delivery']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=jZ3urcWU3NE', 'Vídeo do Symmetry Residence', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '90eababd-0f3d-4139-9e8c-94d4c0ec2dcf';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'terrah-alphaville') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('terrah-alphaville', 'Terrah Alphaville', array['Terrah']::text[], '3 e 4 suítes com vista permanente para reserva ambiental', 'O Terrah Alphaville, da MPD Engenharia, fica na Alameda Walker, no Alphagran, em Alphaville, com vista permanente para uma reserva ambiental. As plantas são de 240 m², 280 m² e 330 m², com 3 ou 4 suítes e 4 ou 5 vagas.

O lazer tem piscina adulto descoberta, piscina coberta, fitness interno e externo, academia, quadra poliesportiva, sport bar, salão de festas, brinquedoteca, playground, espaço delivery e lobby.', 'em_construcao'::status_obra, 'alto_padrao'::tipo_imovel, 'lancamento', 'Barueri', 'Alphagran', 'Alameda Walker, 107 – Alphagran', -23.4886704, -46.8613153, 'MPD Engenharia', null, 1, null, 'https://www.mpd.com.br/empreendimentos/apartamento/terrah-alphaville', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '240 m²', 3, 3, 4, 240, 0);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '280 m²', 4, 4, 5, 280, 1);
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, '330 m²', 4, 4, 5, 330, 2);
  foreach n in array array['Piscina adulto','Piscina coberta','Piscina descoberta','Fitness externo','Academia','Quadra poliesportiva','Sport bar','Salão de festas','Brinquedoteca','Playground','Espaço delivery','Lobby']::text[] loop
    select id into v_lazer from public.lazer_itens where lower(nome) = lower(n) limit 1;
    if v_lazer is null then insert into public.lazer_itens (nome) values (n) returning id into v_lazer; end if;
    insert into public.empreendimento_lazer (empreendimento_id, lazer_item_id) values (v_id, v_lazer) on conflict do nothing;
    v_lazer := null;
  end loop;
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=25fjwfRctb4', 'Vídeo do Terrah Alphaville', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = 'b917f1b1-eb3f-4a07-ab6d-781620baf317';
end $$;

do $$
declare v_id uuid; v_lazer uuid; n text;
begin
  if exists (select 1 from public.empreendimentos where slug = 'vitta-barueri') then return; end if;
  insert into public.empreendimentos (slug, nome, nomes_alternativos, tagline, descricao, status, tipo, finalidade, cidade, bairro, endereco, lat, lng, construtora, total_unidades, total_torres, total_andares, site_construtora, publicado)
  values ('vitta-barueri', 'Vitta Barueri', '{}'::text[], 'Bairro planejado com 928 lotes a partir de 126 m²', 'O Vitta Barueri é um bairro planejado da Vitta Loteamentos (parceria entre TERCASA, Construtora MN e Tradisolo), com 928 lotes a partir de 126 m² para construir.

Tem vias pavimentadas, iluminação moderna, áreas verdes e espaços de lazer para aproveitar em família.', 'em_construcao'::status_obra, 'terreno'::tipo_imovel, 'lancamento', 'Barueri', 'Vila Universal', 'Estrada Dr. Cícero Borges de Morais – Vila Universal', -23.5006431, -46.9043157, 'Vitta Loteamentos (Tercasa)', 928, null, null, 'https://vittaloteamentos.com.br/vittabarueri/', false)
  returning id into v_id;
  insert into public.tipologias (empreendimento_id, nome, dormitorios, suites, vagas, area_privativa, ordem) values (v_id, 'Lote a partir de 126 m²', 0, 0, 0, 126, 0);
  insert into public.midias (empreendimento_id, tipo, url, alt, ordem) values (v_id, 'video'::tipo_midia, 'https://www.youtube.com/watch?v=z2rAsX0AvXs', 'Vídeo do Vitta Barueri', 50);
  update public.catalogo_candidatos
     set empreendimento_id = v_id, decidido_em = now(),
         motivo = 'cadastrado como rascunho a partir do site da construtora'
   where id = '8da16fda-a00a-4e67-b0e8-671fd1d9c65b';
end $$;
