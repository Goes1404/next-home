-- Agenda de visitas: reaproveita a etapa `visita_agendada` que o funil
-- (0007) já tem, em vez de criar uma tabela `visitas` separada. Uma visita É
-- um lead nessa etapa com data marcada — não um objeto novo, e telefone,
-- nome e imóvel já vêm de `leads`/`empreendimentos`.

alter table leads
  add column visita_agendada_em timestamptz;

-- Mesma coluna, mesma policy de update da 0007 ("corretor move os seus,
-- gestor move todos") — só falta o grant, que é por coluna.
grant update (visita_agendada_em) on leads to authenticated;
