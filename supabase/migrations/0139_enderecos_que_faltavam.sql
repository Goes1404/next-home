-- 0139: os endereços que faltavam (02/10/2026)
--
-- Seis imóveis publicados estavam sem endereço. Fonte de cada um (nenhum
-- tem página da construtora com endereço; ficam as dos agregadores, e cada
-- um foi conferido contra a coordenada que o cadastro já tinha):
--
--   Griffe Barueri    Av. Grimaldo Tolaini, 931 (apto.vc + anúncio); o pino
--                     do cadastro está nessa avenida.
--   Vitra Alphaville  Avenida Copacabana, 500 (página da Lopes). O Authoria,
--                     da Dubai, declara o MESMO número no site dela; os dois
--                     ficam na mesma quadra do 18 do Forte.
--   Bosque AlphaGran  Alameda Washington (apto.vc; sem número publicado).
--   Vista AlphaGran   Alameda Washington, 45 (apto.vc + anúncio).
--   Terra Alta        Rua Terra (apto.vc; sem número); o pino bate.
--   Breeze Home Clube Rua São Fernando, 741 – Jardim Júlio. O apto.vc diz
--                     Estrada das Pitas (Votupoca), mas o pino do cadastro
--                     fica a ~150 m da Rua São Fernando e o bairro cadastrado
--                     é Jardim Júlio; as duas vias são vizinhas.
--
-- PINOS ERRADOS: Bosque e Vista AlphaGran estavam a ~2 km da Alameda
-- Washington (no mapa, fora do Alphagran). Passam para pontos da própria
-- alameda (Nominatim, centroide de trechos diferentes, para os dois pinos
-- não se sobreporem). O filtro pela coordenada antiga não mexe em pino que
-- alguém já tenha corrigido.
--
-- Só escreve onde o endereço está vazio.

update public.empreendimentos set endereco = 'Avenida Grimaldo Tolaini, 931 – Votupoca, Barueri'
 where slug = 'minha-casa-minha-vida-analise-de-credito-gratuita-ne78847' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Avenida Copacabana, 500 – Empresarial 18 do Forte, Barueri'
 where slug = 'vitra-alphaville-vt110' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Alameda Washington – Alphagran, Barueri'
 where slug = 'bosque-alphagran-ne55087' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Alameda Washington, 45 – Alphagran, Barueri'
 where slug = 'vista-alphagran-ne83472' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Rua Terra – Jardim Tupanci, Barueri'
 where slug = 'terra-alta-ta141' and coalesce(endereco,'') = '';
update public.empreendimentos set endereco = 'Rua São Fernando, 741 – Jardim Júlio, Barueri'
 where slug = 'breeze-home-clube-bhc741' and coalesce(endereco,'') = '';

update public.empreendimentos set lat = -23.4874, lng = -46.8637
 where slug = 'bosque-alphagran-ne55087' and round(lat::numeric, 4) = -23.4990;
update public.empreendimentos set lat = -23.4879, lng = -46.8666
 where slug = 'vista-alphagran-ne83472' and round(lat::numeric, 4) = -23.4985;
