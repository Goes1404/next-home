-- 0070 — A IA só fala com quem foi liberado de propósito (05/09/2026).
--
-- Relatado em produção: "a IA está respondendo todo mundo, não só quem está
-- no nosso banco". A causa era o PADRÃO-ABERTO da trava de palavra-chave:
-- `exigePalavraChave` devolvia false quando nenhuma palavra válida estava
-- cadastrada, então conversa nova de número desconhecido nascia
-- `liberado_por_palavra_chave = true` — e toda conversa criada antes de a
-- trava existir (0023) ficou congelada liberada para sempre, porque a
-- decisão é gravada no INSERT.
--
-- O código inverteu a polaridade (`exigeLiberacaoExplicita`): desconhecido
-- fica travado SEMPRE, e o que libera é ato deliberado — cliente que já era
-- do CRM antes da conversa, campanha, mensagem de anúncio, frase de entrada,
-- palavra-chave, ou os botões novos do painel ("IA assume" / "Iniciar
-- conversa com IA"). Esta migration aplica a mesma régua ao PASSADO.
--
-- O recorte: conversa orgânica cujo telefone NÃO era do CRM antes dela
-- existir (`cliente_conhecido = false`, congelado no insert pela 0049).
-- Isso retrava também alguma conversa que o corretor tenha liberado de
-- propósito — aceito de olhos abertos: reativar é UM clique no botão novo,
-- e o custo do sentido contrário (IA oferecendo imóvel na conversa da
-- família) já aconteceu e é bem pior.
--
-- Conversas de campanha ficam como estão: quem disparou já decidiu que a
-- IA participa.

update public.whatsapp_conversas
set liberado_por_palavra_chave = false
where origem = 'organica'
  and cliente_conhecido = false
  and liberado_por_palavra_chave = true;

-- Os botões do painel geram resposta com origem própria na telemetria:
-- sem o valor novo no CHECK, o insert falharia e — pelo try/catch de
-- `registrarInteracao` — falharia CALADO, que é como esta base perde dado.
alter table public.ia_interacoes
  drop constraint if exists ia_interacoes_origem_check;

alter table public.ia_interacoes
  add constraint ia_interacoes_origem_check
  check (origem in ('webhook', 'playground', 'followup', 'eval', 'painel'));

-- Reversão:
--   (o retravamento não tem reversão automática — a liberação anterior era
--    justamente o dado errado; reative conversa a conversa pelo painel)
--   alter table public.ia_interacoes drop constraint ia_interacoes_origem_check;
--   alter table public.ia_interacoes add constraint ia_interacoes_origem_check
--     check (origem in ('webhook', 'playground', 'followup', 'eval'));
