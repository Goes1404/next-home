-- 0205: botão "Pausar a IA" no Início (20/10/2026).
--
-- Pausar põe `modo_bot = 'desativado'`; retomar precisa devolver o modo que
-- o corretor tinha escolhido (24/7, noturno, co-piloto), não um padrão.
-- `modo_antes_da_pausa` guarda esse modo. Só o servidor escreve (a action
-- confere a sessão e grava pela chave de serviço), então não ganha grant.
--
-- Aditiva: o código antigo não lê nada disto.

begin;

set local lock_timeout = '5s';

alter table public.corretor_whatsapp_instancias
  add column if not exists modo_antes_da_pausa text
  check (modo_antes_da_pausa is null or modo_antes_da_pausa in ('24_7', 'noturno_e_fds', 'co_piloto_3min'));

comment on column public.corretor_whatsapp_instancias.modo_antes_da_pausa is
  'O modo da IA antes de o corretor tocar em "Pausar a IA" no Início; nulo = não está pausada por esse botão (0205).';

commit;
