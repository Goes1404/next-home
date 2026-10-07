-- 0171 (07/10/2026): pausa das listas frias depois da restrição da conta da Bruna.
--
-- O WhatsApp restringiu o número da Bruna ("mensagens automáticas ou em
-- massa") no meio da lista "300 leads escolhidos a dedo · Dom Parque": 114
-- enviadas, 17 números sem WhatsApp, 169 ainda na fila. A conta aparece
-- desconectada, mas ao reconectar a fila voltaria a andar sozinha. A Carolini
-- tinha 24 números sem WhatsApp em 39 tentativas, o sinal que mais pesa.
--
-- Pausar é reversível pelo botão "Retomar" da tela de listas.
update public.whatsapp_campanhas
   set status = 'pausada'
 where status = 'em_andamento'
   and id in ('ae96c753-b5ce-4494-94cb-456ae51add65',  -- Bruna, 300 leads Dom Parque
              'dcdfa8a5-8340-44aa-acc2-72268be3e04a'); -- Carolini, "Teste"
