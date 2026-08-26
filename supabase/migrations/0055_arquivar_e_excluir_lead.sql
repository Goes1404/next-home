-- Arquivar e excluir lead (pedido de 26/08/2026).
--
-- Até aqui o CRM não tinha NENHUM caminho para tirar um lead da lista: as
-- policies de `leads` cobrem insert, select e update — delete nunca
-- existiu. Duplicado, teste e telefone errado ficavam para sempre.
--
-- São duas ações com pesos diferentes, e a distinção é o ponto:
--
-- 1. ARQUIVAR (`arquivado_em`): o lead some das listas, do funil, da fila
--    e das contagens, e volta com um clique. Nada é destruído. É o botão
--    do dia a dia.
-- 2. EXCLUIR: apaga de verdade, e leva junto por CASCADE o dossiê da IA
--    (`lead_observacoes_ia`), as tarefas (`lead_tarefas`) e a linha do
--    tempo (`lead_interacoes`). A conversa de WhatsApp NÃO é apagada — ela
--    fica sem lead (`set null`), e as mensagens continuam no Live Chat.
--    Existe para pedido de LGPD e cadastro errado.
--
-- Consequência que precisa estar escrita: excluir o lead de quem ainda
-- conversa no WhatsApp não impede a pessoa de voltar. `obterOuCriarConversa`
-- cria o lead de novo na próxima mensagem (0026) — o que se apaga é o
-- registro de hoje, não o futuro.

alter table public.leads add column if not exists arquivado_em timestamptz;

comment on column public.leads.arquivado_em is
  'Quando o lead foi arquivado. Null = ativo. Listas, funil, fila e contagens filtram por is null.';

-- A 0007 fez `revoke update on leads` e concede coluna a coluna: sem este
-- grant a policy passa, o update afeta ZERO linhas e ninguém vê erro
-- nenhum. Já aconteceu antes nesta tabela.
grant update (arquivado_em) on public.leads to authenticated;

-- Índice parcial: as listas pedem `arquivado_em is null` em toda consulta,
-- e o arquivado é a minoria — indexar só quem está arquivado seria o
-- contrário do que se busca.
create index if not exists leads_ativos_idx
  on public.leads (corretor_id, created_at desc)
  where arquivado_em is null;

-- O GRANT é tão obrigatório quanto a policy, e é a armadilha desta tabela:
-- a 0022 revogou `delete` (junto de update e truncate) para tirar o que o
-- Supabase concede por padrão. Com a policy sozinha, o Postgres recusa
-- antes de avaliá-la — "permission denied for table leads". Flagrado ao
-- testar a exclusão com identidade fingida, depois de build e testes
-- verdes: nenhum dos dois alcança permissão de banco.
grant delete on public.leads to authenticated;

-- Mesma régua do resto do CRM (0007): o corretor mexe na própria carteira,
-- o gestor em toda a imobiliária.
drop policy if exists "corretor exclui os seus, gestor exclui todos" on public.leads;
create policy "corretor exclui os seus, gestor exclui todos"
  on public.leads
  for delete to authenticated
  using (public.eh_gestor() or corretor_id = public.corretor_atual());
