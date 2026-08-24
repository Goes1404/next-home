-- 0038 — Separa o que foi TESTE do que é atendimento real.
--
-- Todo o histórico até 24/08/2026 é teste: testes de conexão, de pareamento
-- e de comportamento feitos pela própria equipe na linha pessoal do
-- corretor. Não há um único cliente ali. O que existe é a mãe dele, um
-- amigo, uma conversa sobre aula de escola e mensagens "Teste".
--
-- POR QUE ISSO NÃO É SÓ SOBRE RELATÓRIO. `aprendizadoContinuo.ts` puxa as
-- 40 conversas mais recentes que tenham lead e `recuperacao.ts` ranqueia
-- essas conversas para dentro do prompt como exemplos few-shot. Ou seja: o
-- corpus de teste estava sendo ensinado ao agente como se fosse atendimento
-- que deu certo. Marcar não é higiene de dashboard, é parar de contaminar o
-- prompt.
--
-- Marca em vez de apagar, de propósito. As mensagens são o Live Chat e a
-- linha do tempo do lead — apagar sumiria com histórico que o corretor
-- ainda abre. E telemetria de teste continua útil para diagnosticar a
-- própria plataforma (foi dela que saiu o HTTP 413 da Groq e o 401 da
-- OpenAI).

alter table public.whatsapp_conversas
  add column if not exists e_teste boolean not null default false;

alter table public.ia_interacoes
  add column if not exists e_teste boolean not null default false;

comment on column public.whatsapp_conversas.e_teste is
  'Conversa de teste da equipe. Excluída do few-shot (aprendizadoContinuo) e do golden do eval. Não afeta Live Chat nem CRM.';

comment on column public.ia_interacoes.e_teste is
  'Interação de teste da equipe. Excluída das análises de qualidade; continua valendo para diagnóstico de plataforma.';

-- Backfill: tudo que existe hoje é teste.
update public.whatsapp_conversas set e_teste = true where e_teste = false;
update public.ia_interacoes set e_teste = true where e_teste = false;

-- Índices parciais: as leituras de análise sempre filtram por `e_teste =
-- false`, e daqui para frente essa é a fatia PEQUENA da tabela.
create index if not exists idx_conversas_reais
  on public.whatsapp_conversas (corretor_id, ultima_interacao_em desc)
  where e_teste = false;

create index if not exists idx_ia_interacoes_reais
  on public.ia_interacoes (created_at desc)
  where e_teste = false;

-- Reversão:
--   update public.whatsapp_conversas set e_teste = false;
--   update public.ia_interacoes set e_teste = false;
