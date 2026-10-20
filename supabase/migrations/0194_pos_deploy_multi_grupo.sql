-- 0194: o que só sai DEPOIS do deploy da fase 1 multi-grupo (19/10/2026).
--
-- ===========================================================================
-- APLICAR SÓ DEPOIS DO DEPLOY DO CÓDIGO DESTA BRANCH (fase-1-multi-grupo).
-- Antes dele, o código antigo ainda no ar chama a assinatura antiga do
-- sorteio e o formulário do site grava lead pela chave pública: aplicar esta
-- migration antes derruba o clique pago (cai em /contato) e o formulário de
-- contato. Ordem do roteiro (Task 9): 0190 → 0191 → 0192 → 0193 com o código
-- antigo no ar; deploy; conferir que o commit no ar é o desta branch; só
-- então esta. E só quando não houver mais intenção de voltar o código pelo
-- rollback instantâneo da Vercel: o código antigo não funciona sem o que
-- esta migration apaga.
-- ===========================================================================
--
-- O que ela faz:
--
--   1. Apaga `sortear_corretor_whatsapp(uuid, uuid)`, a assinatura antiga que
--      a 0192 manteve só para a janela entre a migration e o deploy (ela
--      sorteia no grupo 1, fixo no corpo). O código desta branch chama a de
--      três argumentos, com o grupo (`/wa`, `/wa/<campanha>`).
--
--   2. Tira do `anon` a escrita direta em `leads` e `cliques_whatsapp`. Desde
--      a 0001/0014 o formulário do site e o clique de WhatsApp gravavam pela
--      chave pública, que vai no bundle por desenho: com dois grupos, quem
--      tem a chave escolheria em que grupo o lead cai. O código desta branch
--      grava pelo servidor, com o grupo do site (`/api/leads`,
--      `/api/clique-whatsapp`, `/wa`); nada mais grava nessas tabelas pela
--      chave pública (conferido no código: parceiro, e-mail e WhatsApp usam a
--      chave de serviço; importação e indicação usam a sessão do corretor).
--
--      O logado continua cadastrando lead pela sessão (importar, indicação):
--      a policy que valia para todos os papéis ("qualquer um pode enviar um
--      lead", sem `to`) vira uma só para `authenticated`, com a mesma regra.
--      A policy restritiva da 0193 continua prendendo o lead ao grupo dele.
--      Em `cliques_whatsapp` nenhum logado grava pela sessão: a policy de
--      insert sai inteira.
--
-- Teste: src/lib/grupos/isolamento.db.test.ts (seção 0194).
--
-- Volta (só enquanto houver um grupo só): recriar a assinatura antiga pela
-- definição da 0192 e devolver `grant insert on public.leads to anon`,
-- `grant insert (corretor_id, empreendimento_id, origem, url_origem,
-- user_agent) on public.cliques_whatsapp to anon` e as duas policies da
-- 0001/0014.

begin;

-- Mexe em policies de `leads` e `cliques_whatsapp`, que o webhook e o site
-- escrevem em produção. Com o teto, a migration falha e pode ser repetida.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. A assinatura antiga do sorteio
-- ---------------------------------------------------------------------------

drop function if exists public.sortear_corretor_whatsapp(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 2. A chave pública não escreve mais em leads nem em cliques_whatsapp
-- ---------------------------------------------------------------------------

revoke insert on public.leads from anon;
-- Revogar o privilégio da tabela leva junto o de cada coluna (o grant por
-- coluna da 0143), mas fica escrito para ninguém procurar.
revoke insert on public.cliques_whatsapp from anon;
revoke insert (corretor_id, empreendimento_id, origem, url_origem, user_agent)
  on public.cliques_whatsapp from anon;

drop policy if exists "qualquer um pode enviar um lead" on public.leads;
drop policy if exists "logado cadastra lead" on public.leads;
create policy "logado cadastra lead"
  on public.leads
  for insert
  to authenticated
  with check (true);

drop policy if exists "Qualquer visitante pode registrar clique de WhatsApp" on public.cliques_whatsapp;

commit;
