-- 0172 (07/10/2026): o motivo da pausa automática da lista de transmissão.
--
-- O disparador pausa a lista sozinho quando muitos números não têm WhatsApp
-- ou quando pessoas pedem para sair (pausaAutomatica.ts). A coluna guarda o
-- motivo em português para a tela; "Retomar" a limpa. Nula = pausa feita
-- pelo corretor, ou lista que nunca parou sozinha.
alter table public.whatsapp_campanhas
  add column if not exists pausa_automatica text;

comment on column public.whatsapp_campanhas.pausa_automatica is
  'Motivo da pausa feita pelo disparador (números sem WhatsApp, pedidos para sair). Limpa ao retomar.';

-- Ao retomar, os sinais que já existiam viram a base: a pausa automática só
-- volta se aparecerem sinais NOVOS. Sem isso, retomar uma lista pausada
-- sozinha a pausaria de novo na mensagem seguinte.
alter table public.whatsapp_campanhas
  add column if not exists pausa_base jsonb;

comment on column public.whatsapp_campanhas.pausa_base is
  'Sinais (enviados, semWhatsapp, pediramParaSair) no momento em que a lista foi retomada; a pausa automática conta só o que veio depois.';
