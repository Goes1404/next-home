-- 0230: segunda mensagem do modo grupo da roleta (28/10/2026).
--
-- `roleta_anuncios.texto_passagem_grupo`: no modo 'grupo', depois da
-- boas-vindas (0229), o número do anúncio diz quem vai atender
-- ("Estou te direcionando para o *Consultor {corretor}*..."). Separada da
-- `texto_passagem` do modo mensagem, que promete que o corretor "já te chama
-- pelo número dele" e está gravada com esse texto nas roletas existentes.
--
-- Nas duas colunas do modo grupo: nulo = texto padrão do sistema; vazio =
-- aquela mensagem não sai.
--
-- Aditiva. Sem grant: a tabela é só da chave de serviço.

begin;

set local lock_timeout = '5s';

alter table public.roleta_anuncios
  add column if not exists texto_passagem_grupo text;

commit;
