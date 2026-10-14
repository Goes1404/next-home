-- 0178 — O lembrete da tarefa do lead chega no WhatsApp do corretor (14/10/2026).
--
-- A tarefa da ficha do lead ("Próximas ações") só existia na tela: o prazo
-- passava e nada avisava. Agora, no horário marcado, o runner dos follow-ups
-- manda a tarefa para o WhatsApp do PRÓPRIO corretor, pelo mesmo caminho do
-- resumo do dia e dos lembretes das anotações (0100).
--
-- `lembrete_enviado_em` é o claim atômico do runner (um tique só manda);
-- `lembrete_erro` diz por que não saiu (sem número conectado, falha de envio).
-- O que tira a tarefa da tela continua sendo `concluida_em`.
--
-- Colunas novas herdam o grant de TABELA de `lead_tarefas` (a tabela nunca
-- passou para grant por coluna) e a policy "corretor gerencia as proprias
-- tarefas" já recorta as linhas.

alter table public.lead_tarefas
  add column if not exists lembrete_enviado_em timestamptz,
  add column if not exists lembrete_erro text;

-- O que já venceu ou foi concluído antes desta migration NÃO dispara: sem
-- isto, o primeiro tique mandaria de uma vez todas as tarefas antigas.
update public.lead_tarefas
   set lembrete_enviado_em = now()
 where lembrete_enviado_em is null
   and (concluida_em is not null or prazo <= now());

-- O runner varre o mundo inteiro (chave de serviço): vencidas ainda não avisadas.
create index if not exists lead_tarefas_lembrete_pendente_idx
  on public.lead_tarefas (prazo)
  where lembrete_enviado_em is null and concluida_em is null;
