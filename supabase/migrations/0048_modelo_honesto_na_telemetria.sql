-- `ia_interacoes.modelo` nunca pôde dizer "ninguém respondeu".
--
-- A coluna nasceu `not null default 'gemini-2.5-flash'`, quando o Gemini era
-- o único provedor. Com isso, TODA linha ganha um modelo — inclusive as que
-- registram que a IA não foi chamada: `pausada_por_humano` (o corretor está
-- atendendo) e `silenciada_por_modo` saem do webhook ANTES de qualquer
-- chamada, e mesmo assim a linha afirma que um modelo respondeu.
--
-- Medido em 24/08/2026: **1.443 de 1.496 linhas** carimbadas com um modelo
-- que nunca foi chamado. O estrago é de interpretação, e foi real: contando
-- por linha, o Gemini parecia responsável por 97% do atendimento; o número
-- verdadeiro era 9 respostas de 47. Uma conclusão inteira sobre a cascata de
-- provedores saiu daí — e estava errada.
--
-- O código já tinha sido corrigido uma vez para o caso da contingência
-- ("nenhum" em vez do padrão). Não adiantou para este caso porque o defeito
-- está no SCHEMA: um `default` preenche o que o insert omite, então a coluna
-- se recusa a admitir ausência.
--
-- Agora ela admite. `null` = ninguém foi chamado; 'nenhum' = foi chamado e
-- todos falharam (contingência); qualquer outro valor = quem respondeu.
--
-- Consulta que passa a valer: `where modelo is not null` devolve o que a IA
-- de fato respondeu. Era isso que faltava para distinguir "a IA respondeu"
-- de "a IA ficou calada" — a pergunta do dia da abertura.

alter table public.ia_interacoes alter column modelo drop default;
alter table public.ia_interacoes alter column modelo drop not null;

-- Backfill do que nunca teve modelo. Duas famílias:
--
-- 1. As ações que saem antes da chamada — sempre.
-- 2. O debounce PRÉ-IA, que se distingue do pós-IA por não ter latência:
--    quem chegou a chamar o modelo registra `latencia_ms`.
--
-- Não se apaga linha nenhuma: só o campo que era ficção.
update public.ia_interacoes
set modelo = null
where acao in ('pausada_por_humano', 'silenciada_por_modo')
   or (acao = 'absorvida_por_debounce' and latencia_ms is null);

comment on column public.ia_interacoes.modelo is
  'Quem respondeu. null = nenhum modelo foi chamado (bot pausado, silenciado, debounce antes da IA); "nenhum" = todos falharam e a resposta veio da contingência. Para contar atendimento real: where modelo is not null.';
