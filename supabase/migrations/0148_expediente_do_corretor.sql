-- 0148: um expediente só, configurável por corretor (plano de ativação da
-- IA, Fase 5.2, 03/10/2026).
--
-- Antes eram dois relógios fixos no código: o modo "fora do expediente" da
-- IA usava 9h às 18h, e os envios por iniciativa nossa (listas de
-- transmissão, lembrete de visita) usavam 9h às 20h59. Agora o corretor
-- escolhe o expediente dele, e os dois lugares leem o mesmo número.
--
-- Os envios continuam presos à janela segura (9h às 20h59, segunda a
-- sábado): o expediente pode ENCURTAR a janela de envio, nunca alargá-la.
-- Mensagem de propaganda fora dessa janela é o que faz o destinatário
-- denunciar o número, e isso não é configuração.
--
-- O padrão (9h às 21h) mantém a janela de envio de hoje; quem usa o modo
-- "fora do expediente" ajusta o fim para a hora em que para de atender.

alter table public.corretor_whatsapp_instancias
  add column if not exists expediente_inicio smallint not null default 9,
  add column if not exists expediente_fim smallint not null default 21;

alter table public.corretor_whatsapp_instancias
  drop constraint if exists corretor_whatsapp_instancias_expediente_check;
alter table public.corretor_whatsapp_instancias
  add constraint corretor_whatsapp_instancias_expediente_check
    check (expediente_inicio between 0 and 23 and expediente_fim between 1 and 24 and expediente_inicio < expediente_fim);

comment on column public.corretor_whatsapp_instancias.expediente_inicio is
  'Hora em que o corretor começa a atender (0148). Vale para o modo fora do expediente e limita a janela de envio.';
comment on column public.corretor_whatsapp_instancias.expediente_fim is
  'Hora em que o corretor para de atender, exclusiva (0148).';
