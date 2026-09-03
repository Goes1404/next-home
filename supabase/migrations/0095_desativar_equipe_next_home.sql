-- "Equipe Next Home" não é uma pessoa: slug nulo, 0 leads, sem login, e o
-- WhatsApp dela é o MESMO do Eduardo Cezar (5511972207204).
--
-- Enquanto ativa, ela participa da roleta de leads — e como a carga entra na
-- ordenação depois das preferências, uma linha com carga ZERO é justamente a
-- que sobe quando os corretores de verdade começarem a receber. O lead iria
-- para um cadastro que ninguém abre.
--
-- Desativar tira da roleta sem apagar nada: a ficha, o histórico e o número
-- continuam onde estão, e o botão da tela de Contas reverte a qualquer
-- momento.

update public.corretores
   set ativo = false
 where nome = 'Equipe Next Home'
   and ativo;
