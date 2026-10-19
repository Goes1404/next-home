-- 0176 — O limite só volta a 15 depois de 3 dias sem conectar (10/10/2026).
--
-- POR QUE: decisão do dono da conta, no mesmo dia da 0174: "se estiver 3
-- dias sem conectar volta a 15, para não ficar voltando a 15 toda hora". Na
-- 0174 o limite diário voltava ao piso de 15 aos 30 minutos fora do ar,
-- junto com a pausa da lista. Os números caem com frequência: em 10/10,
-- quatro dos seis estavam fora do ar (Ana Lima, Carolini, Bruna e Ramos, de
-- 22 a 50 horas; três com 401, o aparelho desconectado da conta), e todos
-- voltariam a 15.
--
-- O QUE MUDA NO CÓDIGO: `quedaPedeRecomeco` (protecaoDaQueda.ts) só grava
-- `aquecimento_desde` quando a queda passa de 3 dias seguidos sem conectar.
-- Quem reconecta antes volta no ritmo que tinha. A pausa da lista continua
-- aos 30 minutos (0174), sem mudança.
--
-- O QUE ESTA MIGRATION FAZ:
-- 1. Desfaz o recomeço das quedas que ainda não chegaram a 3 dias. Um
--    recomeço cuja queda começou há menos de 3 dias não pode vir da regra
--    nova, que só grava depois de 3 dias fora. Se a queda continuar, a
--    varredura grava de novo quando completar 3 dias (a da Bruna completa
--    em 11/10, 16h10 de Brasília).
-- 2. Apaga o marco de queda velho de número conectado. O webhook e a
--    sincronização apagam o marco quando o número volta; antes da 0174 o
--    webhook não apagava, e o botão Conectar com o número já no ar também
--    não (corrigido junto com esta migration). Com o marco velho, a próxima
--    queda herdaria o começo da anterior e já contaria como 3 dias fora.
--    Em 10/10, só o número da Márcia estava assim (marco de 07/10, antes da
--    primeira conexão dela).
--
-- Aplicar DEPOIS do deploy: até lá o código antigo grava o recomeço aos 30
-- minutos, e o passo 1 só desfaz o que já estiver gravado.

begin;

update public.corretor_whatsapp_instancias
   set aquecimento_desde = null
 where aquecimento_desde is not null
   and aquecimento_desde > now() - interval '3 days';

update public.corretor_whatsapp_instancias
   set desconectado_em = null,
       aviso_queda_enviado_em = null
 where status_conexao = 'conectado'
   and desconectado_em is not null;

comment on column public.corretor_whatsapp_instancias.queda_tratada_em is
  'Quando as listas do corretor foram pausadas pela queda (30 minutos fora do ar, 0174). Menor que desconectado_em = queda nova, ainda não tratada.';
comment on column public.corretor_whatsapp_instancias.aquecimento_desde is
  'Começo da última queda de 3 dias ou mais sem conectar (0176): o limite diário só conta envios dos dias seguintes a ela (limiteDoDia, 0174).';

commit;
