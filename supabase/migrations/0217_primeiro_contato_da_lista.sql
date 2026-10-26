-- 0217: primeiro contato da lista de transmissão (26/10/2026).
--
-- O WhatsApp do Ramos foi desconectado da conta (401) em 21/10, às 09h51, no
-- meio de uma lista para 225 pessoas que nunca tinham falado com ele (200
-- importadas de planilha 18 minutos antes). O espaçamento (1min30 a 2min), a
-- cota do dia (21 e depois 27) e a reescrita do texto estavam todos certos.
-- O que o WhatsApp restringe é o primeiro contato com quem nunca escreveu, em
-- volume, a partir de um número comum — o mesmo padrão da conta da Bruna em
-- 07/10. E as 48 mensagens levavam o MESMO arquivo de foto.
--
-- A coluna marca o envio que foi primeiro contato: é ela que o disparador
-- conta para o teto próprio desses envios (`primeiroContato.ts`). Nula nas
-- linhas antigas: só conta o que sair daqui para a frente.

begin;

set local lock_timeout = '5s';

alter table public.whatsapp_campanhas_fila
  add column if not exists primeiro_contato boolean;

comment on column public.whatsapp_campanhas_fila.primeiro_contato is
  'Envio para quem nunca tinha falado com o corretor (0217). Conta no teto de primeiro contato por dia e por semana.';

create index if not exists whatsapp_campanhas_fila_primeiro_contato_idx
  on public.whatsapp_campanhas_fila (campanha_id, enviado_em)
  where primeiro_contato;

commit;
