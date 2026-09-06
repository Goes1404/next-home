-- 0081 — O corretor precisa enxergar o imóvel que ainda não publicou
--
-- ## O buraco
--
-- `empreendimentos` tinha policy de INSERT e de UPDATE para o corretor
-- logado, e UMA de SELECT: `publicado = true`, para o público. Ou seja:
-- **não havia caminho para o corretor LER um imóvel não publicado** — nem o
-- que ele mesmo acabou de criar.
--
-- Isso torna o cadastro impossível por construção. `publicado` nasce
-- `false` (é o certo: imóvel sem foto e sem ficha não entra na vitrine),
-- então o imóvel recém-criado sumiria no mesmo instante: fora da lista do
-- painel e com o editor devolvendo 404. Cria e some.
--
-- E o buraco não é só do cadastro novo. O editor já tem o interruptor de
-- publicar/despublicar: despublicar um imóvel hoje o torna invisível para
-- quem o despublicou, sem caminho de volta pela tela. Os dois duplicados
-- despublicados na 0046 estão exatamente nesse estado.
--
-- ## Por que a policy é assim
--
-- A condição é a MESMA das policies de insert e update da 0001 — quem tem
-- ficha de corretor. Não recorta por `corretor_id` de propósito: o catálogo
-- é da imobiliária, não de um corretor (mesma decisão da fila de candidatos
-- na 0078), e `empreendimentos.corretor_id` é o corretor em DESTAQUE na
-- página, não o dono do cadastro.
--
-- A RLS é permissiva por OR, então isto SOMA ao que já existia: o público
-- continua vendo só `publicado = true`, e a vitrine lê com a chave anônima.

create policy "corretor le todo empreendimento"
  on public.empreendimentos for select
  to authenticated
  using (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
