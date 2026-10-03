-- 0150: a trava de liberação sai do banco (04/10/2026).
--
-- Parte 2 de 2, aplicada DEPOIS do deploy que parou de ler e escrever as
-- duas colunas (aplicada antes, o código antigo quebraria no insert de
-- conversa e na leitura do painel).
--
-- `liberado_por_palavra_chave` era a trava "a IA espera a palavra-chave nesta
-- conversa"; `cliente_conhecido`, a porta que a dispensava para quem já era
-- do CRM. Desde a 0111 o porteiro não deixa número sem lead entrar, então toda
-- conversa é de cliente cadastrado; desde a 0147 nenhuma nascia nem voltava a
-- travar. As duas viraram estado que ninguém mudava e que confundia quem
-- investigava "por que a IA não respondeu". A decisão inteira mora agora em
-- `src/lib/whatsapp/quandoAIaResponde.ts`.
--
-- A 0149 já tirou as duas colunas das views; conferido antes de escrever:
-- nenhuma função, policy ou trigger as lê.

alter table public.whatsapp_conversas drop column if exists liberado_por_palavra_chave;
alter table public.whatsapp_conversas drop column if exists cliente_conhecido;
