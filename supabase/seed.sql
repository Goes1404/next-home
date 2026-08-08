-- Seed dos 2 empreendimentos curados — dados extraídos do site legado da
-- Next Home (nexthomeimobiliaria.com.br) durante a Fase 5.

with corretor_miro as (
  insert into corretores (nome, creci, whatsapp)
  values ('Miro Araujo', '208199', '5511947258116')
  returning id
),
corretor_renan as (
  insert into corretores (nome, creci, whatsapp)
  values ('Renan Azael', '248164', '5511963310790')
  returning id
),
emp_eternity as (
  insert into empreendimentos (
    slug, nome, tagline, descricao, status, tipo, finalidade,
    cidade, bairro, endereco, preco_a_partir, iptu, condominio_valor,
    construtora, total_unidades, total_torres, total_andares,
    entrega_prevista, destaque, ordem, corretor_id, codigo_legado, publicado
  )
  select
    'eternity-alphaville', 'Eternity Alphaville Tamboré',
    'Descubra o incomparável. Viva além do seu tempo.',
    'Duas torres de alto padrão no Centro Comercial Jubran, a poucos minutos do coração de Alphaville. Unidades de 2 e 3 dormitórios com metragens generosas, posição de frente para a avenida e um clube de lazer completo — da academia com parede verde à piscina aquecida coberta.',
    'em_construcao', 'alto_padrao', 'lancamento',
    'Barueri', 'Centro Comercial Jubran', 'Avenida Piracema, Centro Comercial Jubran, Barueri - SP',
    1289900, 650, 890, 'RSF', 432, 2, 38, '2029-04-01', true, 1, corretor_miro.id, 'NE41168', true
  from corretor_miro
  returning id
),
emp_viva as (
  insert into empreendimentos (
    slug, nome, tagline, descricao, status, tipo, finalidade,
    cidade, bairro, endereco, preco_a_partir, iptu, condominio_valor,
    construtora, total_unidades, total_torres, total_andares,
    entrega_prevista, destaque, ordem, corretor_id, codigo_legado, publicado
  )
  select
    'viva-rsf-vila-do-conde', 'Viva RSF Vila do Conde',
    'Perfeito para relaxar e aproveitar o melhor do seu Viva.',
    'No Parque Viana, a poucos passos de shopping e estação, o Viva RSF Vila do Conde chega com unidades de 43 a 71 m² e um clube de lazer completo: academia com parede verde, coworking, piscina adulto e infantil, quadra poliesportiva e até um espaço pet dedicado.',
    'ultimas_unidades', 'apartamento', 'lancamento',
    'Barueri', 'Parque Viana', 'Parque Viana, Barueri - SP',
    460000, null, null, 'RSF', 298, null, 28, '2027-01-01', true, 2, corretor_renan.id, 'VCOD-117', true
  from corretor_renan
  returning id
),

-- Tipologias
tip_eternity as (
  insert into tipologias (empreendimento_id, nome, area_privativa, dormitorios, suites, banheiros, vagas, preco, ordem)
  select id, '2 dormitórios', 74, 2, 1, 2, 2, 1289900, 1 from emp_eternity
  union all
  select id, '3 dormitórios com 2 suítes', 100, 3, 2, 3, 2, null, 2 from emp_eternity
  returning 1
),
tip_viva as (
  insert into tipologias (empreendimento_id, nome, area_privativa, dormitorios, suites, banheiros, vagas, preco, ordem)
  select id, '3 dormitórios com 1 suíte', 49, 3, 1, 3, 2, 460000, 1 from emp_viva
  returning 1
),

-- Mídias — arquivos publicados no bucket público `empreendimentos` do Supabase Storage.
midias_eternity as (
  insert into midias (empreendimento_id, tipo, url, alt, largura, altura, ordem)
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/eternity-alphaville/fachada.jpg', 'Fachada das torres Eternity Alphaville Tamboré ao entardecer', 900, 636, 1 from emp_eternity
  union all
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/eternity-alphaville/living-02.jpg', 'Living integrado com cozinha e varanda gourmet, unidade 02 e 04', 900, 636, 2 from emp_eternity
  union all
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/eternity-alphaville/living-03.jpg', 'Living integrado com adega climatizada e sala de jantar, unidade 03', 900, 636, 3 from emp_eternity
  returning 1
),
midias_viva as (
  insert into midias (empreendimento_id, tipo, url, alt, largura, altura, ordem)
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/viva-rsf-vila-do-conde/fachada-lazer.jpg', 'Vista aérea da fachada e área de lazer à noite', 831, 578, 1 from emp_viva
  union all
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/viva-rsf-vila-do-conde/piscina-adulto.jpg', 'Piscina adulto com deck e espreguiçadeiras entre os prédios', 831, 578, 2 from emp_viva
  union all
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/viva-rsf-vila-do-conde/academia.jpg', 'Academia equipada com parede verde e esteiras', 831, 578, 3 from emp_viva
  union all
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/viva-rsf-vila-do-conde/coworking.jpg', 'Espaço de coworking com mesas comunitárias e poltronas', 831, 578, 4 from emp_viva
  union all
  select id, 'foto'::tipo_midia, 'https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/viva-rsf-vila-do-conde/pet-place.jpg', 'Espaço pet place com brinquedos e obstáculos para cães', 831, 578, 5 from emp_viva
  returning 1
),

-- Lazer: catálogo único (tabela recém-criada, sem conflitos possíveis ainda)
-- + vínculo por empreendimento.
lazer_unico as (
  insert into lazer_itens (nome)
  select distinct nome from (values
    ('Academia'), ('Piscina aquecida'), ('Piscina coberta'), ('Cinema'), ('Coworking'),
    ('Espaço gourmet'), ('Churrasqueira com piscina'), ('Salão de festas'), ('Playground'),
    ('Espaço pet'), ('Portaria 24h'), ('Piscina adulto'), ('Piscina infantil'),
    ('Churrasqueira'), ('Quadra poliesportiva'), ('Mini market'), ('Brinquedoteca'), ('Jardim')
  ) as t(nome)
  returning id, nome
),
vinculo_eternity as (
  insert into empreendimento_lazer (empreendimento_id, lazer_item_id)
  select emp_eternity.id, lazer_unico.id
  from emp_eternity, lazer_unico
  where lazer_unico.nome in (
    'Academia', 'Piscina aquecida', 'Piscina coberta', 'Cinema', 'Coworking',
    'Espaço gourmet', 'Churrasqueira com piscina', 'Salão de festas', 'Playground',
    'Espaço pet', 'Portaria 24h'
  )
  returning 1
),
vinculo_viva as (
  insert into empreendimento_lazer (empreendimento_id, lazer_item_id)
  select emp_viva.id, lazer_unico.id
  from emp_viva, lazer_unico
  where lazer_unico.nome in (
    'Academia', 'Piscina adulto', 'Piscina infantil', 'Churrasqueira', 'Coworking',
    'Espaço gourmet', 'Salão de festas', 'Portaria 24h', 'Quadra poliesportiva',
    'Mini market', 'Brinquedoteca', 'Espaço pet', 'Jardim'
  )
  returning 1
)
select 'ok' as resultado;
