-- 0084 — Duas versões da mensagem, e a taxa de resposta de cada uma
--
-- ## O número que motiva
--
-- Medido em 01/09: **102 disparos entregues, 1 resposta** — 0,98%. Não é
-- defeito da assistente; ela não chega a conversar. O que decide isso é a
-- mensagem de abertura, a lista e o horário, e nada no sistema permitia
-- comparar duas aberturas.
--
-- Sem isso, "melhorar a mensagem" é a mesma anedota que travou o prompt por
-- quatro versões: alguém troca o texto, o número não se move de forma
-- legível, e ninguém sabe se foi a mudança ou o acaso.
--
-- ## O desenho
--
-- `mensagem_base_b` é opcional: campanha sem ela funciona exatamente como
-- antes. Com ela, cada item da fila recebe uma `variante` ('A' ou 'B'),
-- sorteada de forma BALANCEADA na montagem — metade de cada, não moeda por
-- item, senão uma fila de 20 pode sair 14 x 6 e a comparação nasce torta.
--
-- A resposta já é registrada: `whatsapp_campanhas_fila.status` vira
-- 'respondido' e `resposta_em` é carimbado quando o cliente escreve. A taxa
-- por variante é `respondido / enviado` dentro de cada letra — nenhuma
-- tabela nova, nenhum contador para divergir.

alter table public.whatsapp_campanhas
  add column if not exists mensagem_base_b text;

comment on column public.whatsapp_campanhas.mensagem_base_b is
  'Segunda versao da mensagem para teste A/B. Null = campanha de uma versao so (0084).';

alter table public.whatsapp_campanhas_fila
  add column if not exists variante text
    check (variante is null or variante in ('A', 'B'));

comment on column public.whatsapp_campanhas_fila.variante is
  'Qual versao da mensagem este item usou. Null nos itens anteriores a 0084 e nas campanhas de uma versao (0084).';

-- A leitura é sempre "por campanha, por variante": o índice cobre a conta
-- da tela de resultados sem varrer a fila inteira.
create index if not exists whatsapp_campanhas_fila_variante_idx
  on public.whatsapp_campanhas_fila (campanha_id, variante, status)
  where variante is not null;

-- Grants: a fila e as campanhas são escritas pelo cliente de serviço
-- (disparador, cron) e lidas pelo painel. Coluna nova em tabela que já
-- passou pela varredura da 0082 herda o revoke do `anon`; confirmado aqui
-- por explícito, porque a 0082 foi um laço sobre o que existia NAQUELE
-- instante e não alcança coluna criada depois.
revoke insert, update, delete, truncate on public.whatsapp_campanhas from anon;
revoke insert, update, delete, truncate on public.whatsapp_campanhas_fila from anon;
