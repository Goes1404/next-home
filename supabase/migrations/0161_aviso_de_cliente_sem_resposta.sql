-- 0161 (06/10/2026): cliente sem resposta há 30 minutos vira aviso no
-- WhatsApp do corretor (`alertaSemResposta.ts`, no tique dos follow-ups).
-- Desde a 0152 a fala do corretor desliga a IA na conversa; se ele assume e
-- esquece, o cliente fica esperando e só a fila do Início sabia.
--
-- O carimbo é o claim do aviso e marca a espera já avisada: só vale para a
-- espera atual se for posterior à última resposta nossa (IA ou corretor).
-- Escrito só pelo servidor (chave de serviço); nenhum grant novo.
alter table public.whatsapp_conversas
  add column if not exists aviso_sem_resposta_em timestamptz;

comment on column public.whatsapp_conversas.aviso_sem_resposta_em is
  'Último aviso ao corretor de cliente sem resposta há 30 min (0161). Vale para a espera atual se for posterior à última mensagem do bot ou do corretor.';
