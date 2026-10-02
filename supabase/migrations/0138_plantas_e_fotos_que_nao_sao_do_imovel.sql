-- 0138: plantas e fotos que não são do imóvel (02/10/2026)
--
-- Achadas na conferência imagem por imagem da 0137. Ficaram fora dela porque
-- a ferramenta de migration cancela comandos `delete`; rodar no editor SQL
-- do Supabase (Projeto -> SQL Editor), colando este arquivo inteiro.
--
-- Os filtros `area_privativa is null` garantem que nada já corrigido à mão
-- é apagado. A ordem importa: a mídia da lâmina de diferenciais é achada
-- pela linha de planta que aponta para ela, então sai ANTES da linha.

-- A lâmina de diferenciais do Authoria estava como planta. Não é planta nem
-- foto: sai da galeria. (O arquivo fica no Storage, sem uso.)
delete from public.midias
 where tipo = 'planta' and url in (select planta_url from public.tipologias where id::text like 'edd74f4a%');

-- As sete linhas.
delete from public.tipologias where id::text like 'eaa8fa64%' and area_privativa is null; -- implantação (Acervo Residences)
delete from public.tipologias where id::text like '6463f90d%' and area_privativa is null; -- planta do pavimento inteiro (Andromêda)
delete from public.tipologias where id::text like '0d4cbdbe%' and area_privativa is null; -- foto do living, não planta (Alpha Park View)
delete from public.tipologias where id::text like '3a2aa19b%' and area_privativa is null; -- andar inferior da penthouse, já descrita na linha do andar superior (Arborium)
delete from public.tipologias where id::text like 'edd74f4a%' and area_privativa is null; -- imagem de diferenciais, não planta (Authoria)
delete from public.tipologias where id::text like '79f082d8%' and area_privativa is null; -- planta do rooftop, não de apartamento (Eternity)
delete from public.tipologias where id::text like 'c2e070f8%' and area_privativa is null; -- foto do living, não planta (Bless Jardim Esperança)

-- ---------------------------------------------------------------------------
-- FOTOS QUE NÃO SÃO DO IMÓVEL, OU SÃO CÓPIA PEQUENA DE OUTRA
-- (conferidas visualmente em 02/10/2026)
-- ---------------------------------------------------------------------------

-- Alpha Park View: o leitor do site trouxe o bloco "conheça também" da
-- construtora. Seis fotos são de OUTROS empreendimentos.
delete from public.midias where id::text like 'ab1136ff%'; -- Art Design Alphaville
delete from public.midias where id::text like '499f5df1%'; -- Bosque AlphaGran
delete from public.midias where id::text like '83c1020e%'; -- Eternity Alphaville
delete from public.midias where id::text like 'ff5a97c2%'; -- Liv Stay Residence
delete from public.midias where id::text like 'e76f02b1%'; -- NID Alphaville
delete from public.midias where id::text like '76e53337%'; -- Royal Barueri II
-- e três cópias pequenas de fotos que já estão na galeria
delete from public.midias where id::text like 'ecf9437f%'; -- living, recorte de celular
delete from public.midias where id::text like 'cfcf5ea2%'; -- torres, recorte de celular
delete from public.midias where id::text like '89c48a1e%'; -- living 320x200 (era "planta")

-- Copa 18 do Forte: as fotos "mini" do site da J Almeida Matos. Três são
-- cópia pequena de fotos grandes já cadastradas; as outras cinco são de
-- OUTROS imóveis da imobiliária (casas e apartamentos usados).
delete from public.midias where id::text like 'de0f3d28%';
delete from public.midias where id::text like '3de1ef4f%';
delete from public.midias where id::text like '86020d77%';
delete from public.midias where id::text like '586291fc%';
delete from public.midias where id::text like 'd06c151f%';
delete from public.midias where id::text like '004222bf%';
delete from public.midias where id::text like '6b997883%';
delete from public.midias where id::text like '2c97d0d8%';

-- Dellagio: faixa decorativa do site (1920x169) e três miniaturas cuja foto
-- grande já está na galeria com outro endereço.
delete from public.midias where id::text like '68572860%'; -- faixa decorativa
delete from public.midias where id::text like '162fea77%'; -- guarita (miniatura)
delete from public.midias where id::text like '9aec71ca%'; -- playground (miniatura)
delete from public.midias where id::text like '99783bb2%'; -- quadra (miniatura)

-- Miniaturas cuja versão grande o script `trazerFotos0137` trouxe. Só sai a
-- miniatura que TEM a grande ao lado: rodar antes do script não apaga nada.
delete from public.midias mini
 where mini.origem_url ~ '(dellagio/novo/thumb/|alphaparkview\.com/imagens/lazer/thumb/)'
   and exists (
     select 1 from public.midias grande
      where grande.empreendimento_id = mini.empreendimento_id
        and grande.origem_url = replace(replace(mini.origem_url, '/novo/thumb/', '/novo/'), '/lazer/thumb/', '/lazer/full/')
   );
