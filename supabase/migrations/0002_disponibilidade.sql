-- Disponibilidade por tipologia.
--
-- Fica nula por padrão de propósito: a UI só exibe o aviso de unidades
-- restantes quando há um número real informado pela equipe. Escassez
-- inventada além de enganar o comprador é prática vedada pelo CDC, então
-- o default nunca pode ser um número "de enfeite".
alter table tipologias
  add column unidades_disponiveis int
    check (unidades_disponiveis is null or unidades_disponiveis >= 0);

comment on column tipologias.unidades_disponiveis is
  'Unidades ainda disponíveis nesta tipologia. Null = não informado (a UI omite o aviso).';
