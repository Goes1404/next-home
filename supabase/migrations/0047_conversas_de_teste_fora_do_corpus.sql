-- Teste não pode virar exemplo.
--
-- Medido em 24/08/2026: as 4 conversas "reais" do banco eram o próprio
-- corretor testando dos dois lados — 172 mensagens de cliente, 1.352 dele
-- respondendo à mão, ZERO do bot. Todas com `e_teste = false`.
--
-- O problema não é o dado ocupar espaço, é PARA ONDE ele vai:
-- `aprendizadoContinuo.ts` e `scripts/eval/exportarGolden.ts` filtram por
-- `e_teste = false`, ou seja, INCLUEM essas. Cada resposta que a IA gerasse
-- daqui para frente carregaria, como exemplo de "conversa que dá certo", o
-- corretor conversando consigo mesmo. É a lição da 0038 se repetindo: a
-- palavra-chave de teste existe exatamente para isso e não foi usada.
--
-- Critério para marcar: conversa em que o BOT nunca falou mas o CORRETOR
-- falou muito. Atendimento de verdade tem resposta da IA; conversa com
-- centenas de mensagens do corretor e nenhuma do bot é teste ou é
-- atendimento 100% manual — e nos dois casos ela não serve de exemplo do
-- que a IA deve fazer.
--
-- Reversível: `update ... set e_teste = false` devolve. Nada é apagado.

update public.whatsapp_conversas c
set e_teste = true
where c.e_teste = false
  and not exists (
    select 1 from public.whatsapp_mensagens m
    where m.conversa_id = c.id and m.remetente = 'bot'
  )
  and (
    select count(*) from public.whatsapp_mensagens m
    where m.conversa_id = c.id and m.remetente = 'corretor'
  ) >= 5;

-- Índice para a consulta que o few-shot faz a cada resposta: "conversas
-- deste corretor que não são teste". Sem ele, o corpus inteiro é varrido a
-- cada mensagem — barato com 46 conversas, caro no volume que vem depois.
create index if not exists whatsapp_conversas_corpus_idx
  on public.whatsapp_conversas (corretor_id, e_teste, created_at desc);

comment on column public.whatsapp_conversas.e_teste is
  'Conversa de teste do corretor. Fica FORA do few-shot (aprendizadoContinuo.ts) e do golden dataset (exportarGolden.ts). Marcada pela palavra-chave de teste da instância ou, retroativamente, pela 0047.';
