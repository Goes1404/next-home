-- 0153: listas de transmissão podem ser canceladas (03/10/2026).
--
-- Fase 1 do plano das listas: pausar, retomar e cancelar UMA lista sem mexer
-- nas outras do corretor. Pausar já existia no vocabulário ('pausada') e o
-- disparador só pega lista 'em_andamento'. Cancelar é estado novo: a lista
-- encerrada antes do fim, com os pendentes removidos — diferente de
-- 'concluida', que é a lista que terminou de sair. Sem o estado próprio, o
-- histórico diria "Concluída" para uma lista que o corretor interrompeu.
--
-- Só troca o CHECK; o código antigo nunca grava 'cancelada', então pode ser
-- aplicada antes do deploy.

alter table public.whatsapp_campanhas drop constraint if exists whatsapp_campanhas_status_check;
alter table public.whatsapp_campanhas
  add constraint whatsapp_campanhas_status_check
  check (status in ('rascunho', 'em_andamento', 'pausada', 'concluida', 'cancelada'));
