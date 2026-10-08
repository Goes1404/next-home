-- 0173 (08/10/2026): a conferência do texto de cada mensagem da lista.
--
-- Antes de cada envio, o disparador confere se o texto não ficou parecido com
-- outro que o número mandou nos últimos 30 dias (variacaoDeTexto.ts). Medido na
-- semana em que o WhatsApp restringiu a conta da Bruna: 65 das 114 mensagens
-- dela saíram idênticas, e as reescritas da IA tinham mediana de 0,95 de
-- semelhança com uma anterior.
--
-- As duas colunas são do disparador (chave de serviço). A tabela segue o regime
-- de sempre: o corretor lê e altera a fila das próprias listas pela RLS.
alter table public.whatsapp_campanhas_fila
  add column if not exists semelhanca_max real,
  add column if not exists tentativas_texto smallint not null default 0;

comment on column public.whatsapp_campanhas_fila.semelhanca_max is
  'Maior semelhança (0 a 1) do texto com as mensagens do número nos 30 dias anteriores, medida antes do envio. Nula = texto ainda não conferido.';

comment on column public.whatsapp_campanhas_fila.tentativas_texto is
  'Ciclos do disparador em que a IA não conseguiu um texto diferente o bastante. Ao chegar a 4, a lista pausa sozinha.';
