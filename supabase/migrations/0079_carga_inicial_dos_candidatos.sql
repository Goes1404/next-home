-- 0079 — A primeira carga da fila de candidatos (levantamento de 01/09/2026)
--
-- Os 39 empreendimentos de Barueri em obra ou em lançamento, do
-- levantamento em `docs/levantamentos/barueri-2026-09-01.json`. Os 6 com
-- nome IDÊNTICO a um do catálogo já entram como `ja_temos`; os 3 com nome
-- PARECIDO entram como `pendente` com o motivo escrito, porque nome
-- parecido não é o mesmo imóvel — "Dom Barueri" não é o "Dom Parque" e
-- "La Vista Barueri" não é o "Vista AlphaGran". Os outros 30 ficam
-- pendentes, para o corretor decidir o que a Next Home de fato representa.
--
-- O `on conflict ... do update set visto_em = now()` é o que faz o
-- levantamento poder rodar de novo sem apagar decisão: candidato já
-- decidido só tem a data de "visto pela última vez" atualizada.

insert into public.catalogo_candidatos (ref_externa,nome,bairro,status_obra,dormitorios,area,link,decisao,motivo) values
('terra-alta-barueri','Terra Alta Barueri','Jardim Tupanci, Jardim Esperança, Vila Porto','Em construção','1 a 3 quartos','50 a 168 m²','https://apto.vc/br/sp/barueri/jardim-tupanci/terra-alta-barueri','ja_temos','nome idêntico ao do catálogo (conferido em 01/09)'),
('vitta-barueri','Vitta Barueri','Vila Universal','Em construção','studio','126 m²','https://apto.vc/br/sp/barueri/vila-universal/vitta-barueri','pendente',null),
('nova-california','Nova Califórnia','Jardim Califórnia','Lançamento','2 quartos','46 a 92 m²','https://apto.vc/br/sp/barueri/jardim-california/nova-california','pendente',null),
('la-vista-barueri','La Vista Barueri','Vila Universal','Em construção','1 e 2 quartos','48 a 60 m²','https://apto.vc/br/sp/barueri/vila-universal/la-vista-barueri','pendente',null),
('breeze-home-clube','Breeze Home Clube','Votupoca, Jardim do Líbano','Em construção','2 e 3 quartos','49 a 65 m²','https://apto.vc/br/sp/barueri/votupoca/breeze-home-clube','ja_temos','nome idêntico ao do catálogo (conferido em 01/09)'),
('dom-barueri','Dom Barueri','Jardim Tupanci','Lançamento','1 a 3 quartos','47 a 77 m²','https://apto.vc/br/sp/barueri/jardim-tupanci/dom-barueri','pendente','nome PARECIDO com um do catálogo — conferir se é o mesmo imóvel'),
('griffe-barueri','Griffe Barueri','Votupoca','Em construção','2 quartos','52 m²','https://apto.vc/br/sp/barueri/votupoca/griffe-barueri','pendente',null),
('viva-rsf-vila-do-conde','Viva RSF Vila do Conde','Vila do Conde','Em construção','1 a 3 quartos','49 a 71 m²','https://apto.vc/br/sp/barueri/vila-do-conde/viva-rsf-vila-do-conde','ja_temos','nome idêntico ao do catálogo (conferido em 01/09)'),
('serenne','Serenne','Vila Nossa Senhora da Escada','Em construção','2 quartos','49 e 53 m²','https://apto.vc/br/sp/barueri/vila-nossa-senhora-da-escada/serenne','pendente',null),
('liv-stay-residence','Liv Stay Residence','Centro Comercial','Em construção','1 quarto','35 m²','https://apto.vc/br/sp/barueri/centro-comercial/liv-stay-residence','pendente',null),
('joy-barueri','Joy Barueri','Cruz Preta','Em construção','2 e 3 quartos','65 a 167 m²','https://apto.vc/br/sp/barueri/cruz-preta/joy-barueri','pendente',null),
('manaca-barueri','Manacá Barueri','Aldeia','Em construção','2 e 3 quartos','63 e 81 m²','https://apto.vc/br/sp/barueri/aldeia/manaca-barueri','ja_temos','nome idêntico ao do catálogo (conferido em 01/09)'),
('alpha-park-view','Alpha Park View','Aldeia, Nova Aldeinha','Em construção','2 e 3 quartos','67 e 84 m²','https://apto.vc/br/sp/barueri/aldeia/alpha-park-view','pendente',null),
('beyond-residence','Beyond Residence','Alphaville, Centro Comercial','Lançamento','1 a 3 quartos','43 a 79 m²','https://apto.vc/br/sp/barueri/alphaville/beyond-residence','pendente',null),
('royal-barueri','Royal Barueri','Aldeia, Nova Aldeinha, Vila Militar','Em construção','1 a 3 quartos','57 a 86 m²','https://apto.vc/br/sp/barueri/aldeia/royal-barueri','pendente','nome PARECIDO com um do catálogo — conferir se é o mesmo imóvel'),
('bosque-alphagran','Bosque Alphagran','Alphagran','Em construção','1 a 3 quartos','52 a 335 m²','https://apto.vc/br/sp/barueri/alphagran/bosque-alphagran','ja_temos','nome idêntico ao do catálogo (conferido em 01/09)'),
('royal-barueri-ii','Royal Barueri II','Aldeia, Nova Aldeinha, Vila Militar','Em construção','2 e 3 quartos','74 a 105 m²','https://apto.vc/br/sp/barueri/aldeia/royal-barueri-ii','pendente',null),
('nid-alphaville','NID Alphaville','Alphaville, Tamboré','Em construção','2 a 4 quartos','75 a 153 m²','https://apto.vc/br/sp/barueri/alphaville/nid-alphaville','pendente',null),
('symmetry-residence','Symmetry Residence','Alphaville, Tamboré, Centro Comercial Jubran','Em construção','1 a 3 quartos','65 a 118 m²','https://apto.vc/br/sp/barueri/alphaville/symmetry-residence','pendente',null),
('eternity-residence','Eternity Residence','Alphaville','Em construção','2 e 3 quartos','88 a 122 m²','https://apto.vc/br/sp/barueri/alphaville/eternity-residence','pendente','nome PARECIDO com um do catálogo — conferir se é o mesmo imóvel'),
('amaz-alphaville','Amáz Alphaville','Alphaville','Em construção','2 e 3 quartos','89 a 226 m²','https://apto.vc/br/sp/barueri/alphaville/amaz-alphaville','pendente',null),
('dellagio','Dellagio','Empresarial 18 do Forte','Em construção','2 e 3 quartos','94 a 120 m²','https://apto.vc/br/sp/barueri/empresarial-18-do-forte/dellagio','pendente',null),
('oasis-home-resort','Oásis Home Resort','Alphaville','Em construção','2 e 3 quartos','74 e 90 m²','https://apto.vc/br/sp/barueri/alphaville/oasis-home-resort','pendente',null),
('square-design-residence','Square Design Residence','Residencial 18 do Forte','Lançamento','2 e 3 quartos','94 a 121 m²','https://apto.vc/br/sp/barueri/residencial-18-do-forte/square-design-residence','pendente',null),
('open-view-47','Open View 47','Alphaville Residencial Zero','Em construção','2 e 3 quartos','119 a 233 m²','https://apto.vc/br/sp/barueri/alphaville-residencial-zero/open-view-47','pendente',null),
('acervo-apartments','Acervo Apartments','Alphaville','Em construção','2 quartos','95 e 99 m²','https://apto.vc/br/sp/barueri/alphaville/acervo-apartments','pendente',null),
('kaa-home-boutique','KA’A Home Boutique','Alphaville, Alphaville Empresarial, Alphagran','Em construção','3 quartos','130 e 268 m²','https://apto.vc/br/sp/barueri/alphaville/kaa-home-boutique','pendente',null),
('andromeda-by-mpd','Andromêda by MPD','Alphaville, Alphaville Empresarial','Em construção','1 e 2 quartos','95 m²','https://apto.vc/br/sp/barueri/alphaville/andromeda-by-mpd','pendente',null),
('acervo-residences','Acervo Residences','Alphaville Conde I','Em construção','3 e 4 quartos','188 e 299 m²','https://apto.vc/br/sp/barueri/alphaville-conde-i/acervo-residences','pendente',null),
('copa-18-do-forte','Copa 18 do Forte','Empresarial 18 do Forte','Em construção','2 e 3 quartos','117 e 120 m²','https://apto.vc/br/sp/barueri/empresarial-18-do-forte/copa-18-do-forte','pendente',null),
('arborea-alphagran','Arbórea Alphagran','Alphaville','Lançamento','3 e 4 quartos','231 a 578 m²','https://apto.vc/br/sp/barueri/alphaville/arborea-alphagran','pendente',null),
('authoria-por-dubai','Authoria por Dubai','Alphaville','Lançamento','4 quartos','272 m²','https://apto.vc/br/sp/barueri/alphaville/authoria-por-dubai','pendente',null),
('vista-alphagran','Vista Alphagran','Alphaville Industrial, Alphaville, Alphagran','Em construção','3 e 4 quartos','247 a 417 m²','https://apto.vc/br/sp/barueri/alphaville-industrial/vista-alphagran','ja_temos','nome idêntico ao do catálogo (conferido em 01/09)'),
('terrah','Terrah','Alphaville, Alphagran, Alphaville Empresarial','Em construção','3 e 4 quartos','330 m²','https://apto.vc/br/sp/barueri/alphaville/terrah','pendente',null),
('signature-alphaville','Signature Alphaville','Alphaville, Alphagran, Alphaville Empresarial','Em construção','4 quartos','365 m²','https://apto.vc/br/sp/barueri/alphaville/signature-alphaville','pendente',null),
('flora-alphaville','Florà Alphaville','Alphaville, Alphaville Empresarial, Alphagran','Em construção','3 a 5 quartos','420 e 565 m²','https://apto.vc/br/sp/barueri/alphaville/flora-alphaville','pendente',null),
('reserva-da-mata1','Reserva da Mata','Jardim do Líbano','Lançamento','2 e 3 quartos','60 a 120 m²','https://apto.vc/br/sp/barueri/jardim-do-libano/reserva-da-mata1','pendente',null),
('chateau-jardin','Chateau Jardin','Centro Comercial Jubran','Lançamento','studio e 2 quartos','32 a 112 m²','https://apto.vc/br/sp/barueri/centro-comercial-jubran/chateau-jardin','pendente',null),
('sunset-itapecuru','Sunset Itapecuru','Alphaville, Alphaville Industrial','Em construção','3 e 4 quartos','228 e 418 m²','https://apto.vc/br/sp/barueri/alphaville/sunset-itapecuru','pendente',null)
on conflict (fonte, ref_externa) do update set visto_em = now();