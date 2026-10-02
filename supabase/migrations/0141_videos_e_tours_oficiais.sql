-- 0141 — Vídeos e tours 360 dos imóveis que não tinham nenhum (02/10/2026)
--
-- 18 imóveis publicados estavam sem vídeo e sem tour. Entram aqui só vídeos
-- publicados pelo canal da PRÓPRIA construtora (conferido pelo author_name do
-- oEmbed do YouTube) ou embutidos no site oficial do empreendimento: vídeo de
-- corretor de outra imobiliária traz o telefone dele.
--
--   APV           SnphxzcRChE  embutido em alphaparkview.com
--   Authoria      yfMceGNd3K0  Dubai Incorporação e Construção
--   Beyond        UWCaBlYQGuI  RSF + 3 tours do site da RSF (tourbrasil360)
--   Liv Stay      uGiDqOCAkbM  RSF. Os tours da página do Liv Stay ficaram de
--                              fora: o título e a descrição deles são do Beyond.
--   Bless Parque  h8OFm-gGuKk  RSF
--   Breeze        ZubJIGFkLDk  RSF
--   Bosque        9i9Gu5XBvhA  JMF
--   Vista         fUdDwwBKhEM  JMF
--   Bit           a9jnPiFCcJg  Mint Incorporadora
--   Griffe        wxaUpT1dICE  EPH Incorporadora
--   On The Park   aA4xXwf_KuQ  CNL
--   Terra Alta    Zj9MBC0iydQ  RVS Incorporadora
--   Vila Eco Park pl18dyZZ6Og  Árbore (fase Jatobás, a das fotos do cadastro)
--   Vitra         R177eYAgGpQ, zd0f6_Z0HWo  Lidera
--
-- Sem vídeo oficial achado: Royal Barueri, Copa 18 do Forte, La Vista
-- Barueri e Nova Califórnia.

insert into public.midias (empreendimento_id, tipo, url, alt, ordem)
select e.id, v.tipo::public.tipo_midia, v.url, v.alt, v.ordem
  from (values
    ('apartamento-ao-lado-do-shopping-apv668', 'video', 'https://www.youtube.com/watch?v=SnphxzcRChE', 'Alpha Park View — vídeo institucional', 50),
    ('authoria-por-dubai', 'video', 'https://www.youtube.com/watch?v=yfMceGNd3K0', 'Authoria por Dubai', 50),
    ('beyond-residence', 'video', 'https://www.youtube.com/watch?v=UWCaBlYQGuI', 'Beyond Residence', 50),
    ('beyond-residence', 'tour360', 'https://tourbrasil360.com/imoveis/rsf/beyond/tipologia-2-final/', 'Tour 360° — planta 1', 51),
    ('beyond-residence', 'tour360', 'https://tourbrasil360.com/imoveis/rsf/beyond/tipologia-1-final/', 'Tour 360° — planta 2', 52),
    ('beyond-residence', 'tour360', 'https://tourbrasil360.com/imoveis/rsf/beyond/tipologia-3-final/', 'Tour 360° — planta 3', 53),
    ('liv-stay-residence', 'video', 'https://www.youtube.com/watch?v=uGiDqOCAkbM', 'Liv Stay Residence — conceito', 50),
    ('3-dormitorios-com-suite-e-2-vagas-blsp634', 'video', 'https://www.youtube.com/watch?v=h8OFm-gGuKk', 'Bless Parque Barueri', 50),
    ('breeze-home-clube-bhc741', 'video', 'https://www.youtube.com/watch?v=ZubJIGFkLDk', 'Lançamento Breeze Home Clube', 50),
    ('bosque-alphagran-ne55087', 'video', 'https://www.youtube.com/watch?v=9i9Gu5XBvhA', 'Bosque AlphaGran', 50),
    ('vista-alphagran-ne83472', 'video', 'https://www.youtube.com/watch?v=fUdDwwBKhEM', 'Vista AlphaGran', 50),
    ('melhor-valor-de-metro-da-regiao-btb103', 'video', 'https://www.youtube.com/watch?v=a9jnPiFCcJg', 'Bit Barueri', 50),
    ('minha-casa-minha-vida-analise-de-credito-gratuita-ne78847', 'video', 'https://www.youtube.com/watch?v=wxaUpT1dICE', 'Griffe Barueri', 50),
    ('on-the-park-alphaville-ne72055', 'video', 'https://www.youtube.com/watch?v=aA4xXwf_KuQ', 'On The Park', 50),
    ('terra-alta-ta141', 'video', 'https://www.youtube.com/watch?v=Zj9MBC0iydQ', 'Terra Alta Barueri', 50),
    ('vila-eco-park-mj605', 'video', 'https://www.youtube.com/watch?v=pl18dyZZ6Og', 'Vila Eco Park Jatobás', 50),
    ('vitra-alphaville-vt110', 'video', 'https://www.youtube.com/watch?v=R177eYAgGpQ', 'Vitra Alphaville', 50),
    ('vitra-alphaville-vt110', 'video', 'https://www.youtube.com/watch?v=zd0f6_Z0HWo', 'Vitra Alphaville — decorado', 51)
  ) as v(slug, tipo, url, alt, ordem)
  join public.empreendimentos e on e.slug = v.slug
 where not exists (select 1 from public.midias m where m.empreendimento_id = e.id and m.url = v.url);
