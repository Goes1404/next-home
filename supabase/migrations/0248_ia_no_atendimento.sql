-- 0248 · IA no atendimento: resumo da conversa e nota do lead (30/10/2026)
--
-- Pedido do dono: "precisamos deixar nossa plataforma funcional, tecnológica,
-- que automatize muitas tarefas" — pacote "IA no atendimento":
--
--   1. Áudio do WhatsApp vira texto. SEM banco novo: a transcrição troca o
--      marcador na própria `whatsapp_mensagens.conteudo`, e o teto diário por
--      grupo conta as linhas de `ia_consumo` (0233) com finalidade
--      `transcricao_audio`. O índice `ia_consumo_grupo_data_idx` (0233)
--      atende a contagem do dia.
--
--   2. Resumo da conversa + próximo passo sugerido. Cache NO LEAD (o dossiê
--      já é do lead, e o lead pode ter mais de uma conversa):
--        `resumo_conversa`     jsonb  {quer, objecoes, combinado, proximoPasso, temperatura}
--        `resumo_conversa_em`  quando foi gerado
--        `resumo_conversa_ate` a mensagem mais nova que ele cobre (created_at)
--      Gerado sob demanda pela ficha/conversa, pela SESSÃO de quem abre: por
--      isso as colunas ganham grant de update para o `authenticated` (a RLS
--      de `leads` continua decidindo a linha). Finalidade nova no livro do
--      consumo: `resumo_conversa` (o CHECK da 0233 só confere o formato).
--
--   3. Nota do lead (0–100, quente/morno/frio, motivo de uma linha):
--        `nota_score`, `nota_label`, `nota_motivo`, `nota_calculada_em`
--      Calculada pela régua determinística de `src/lib/crm/notaDoLead.ts`
--      (webhook, varredura do tique dos follow-ups a cada 6h, ficha aberta
--      pela sessão) e refinada em até 10 pontos pela leitura do resumo. O
--      índice serve o "mais quentes primeiro" da lista e a varredura.
--
-- Só ADITIVO: colunas novas em `leads` (tabela do grupo, já carimbada pela
-- 0191 — coluna nova não precisa de gatilho) e dois índices. Nenhuma tabela
-- nova, nada removido.
--
-- Aplicar ANTES do deploy é o recomendado (sem ela as telas funcionam: a
-- lista repete a consulta sem a nota no 42703, o cartão do resumo não
-- aparece e a varredura fica quieta — mas nada é calculado).
--
-- Reversão:
--   drop index if exists public.leads_nota_quentes_idx;
--   drop index if exists public.leads_nota_vencida_idx;
--   alter table public.leads
--     drop column if exists nota_score, drop column if exists nota_label,
--     drop column if exists nota_motivo, drop column if exists nota_calculada_em,
--     drop column if exists resumo_conversa, drop column if exists resumo_conversa_em,
--     drop column if exists resumo_conversa_ate;

begin;
set local lock_timeout = '5s';

alter table public.leads
  add column if not exists nota_score smallint
    check (nota_score is null or nota_score between 0 and 100),
  add column if not exists nota_label text
    check (nota_label is null or nota_label in ('quente', 'morno', 'frio')),
  add column if not exists nota_motivo text
    check (nota_motivo is null or char_length(nota_motivo) <= 200),
  add column if not exists nota_calculada_em timestamptz,
  add column if not exists resumo_conversa jsonb
    check (resumo_conversa is null or jsonb_typeof(resumo_conversa) = 'object'),
  add column if not exists resumo_conversa_em timestamptz,
  add column if not exists resumo_conversa_ate timestamptz;

comment on column public.leads.nota_score is
  'Nota do lead 0-100 (src/lib/crm/notaDoLead.ts, 0248). Régua determinística, refinada pela leitura do resumo.';
comment on column public.leads.resumo_conversa is
  'Cache do resumo da conversa: {quer, objecoes, combinado, proximoPasso, temperatura} (0248).';

-- "Mais quentes primeiro" na lista (por grupo, só os ativos).
create index if not exists leads_nota_quentes_idx
  on public.leads (grupo_id, nota_score desc nulls last, created_at desc)
  where arquivado_em is null;

-- A varredura do tique: as notas nunca calculadas e as mais velhas primeiro.
create index if not exists leads_nota_vencida_idx
  on public.leads (nota_calculada_em asc nulls first)
  where arquivado_em is null;

-- A 0007 fez `revoke update on leads from authenticated` e concede coluna a
-- coluna. A ficha aberta grava o cache do resumo e a nota pela sessão.
grant update (
  nota_score, nota_label, nota_motivo, nota_calculada_em,
  resumo_conversa, resumo_conversa_em, resumo_conversa_ate
) on public.leads to authenticated;

commit;
