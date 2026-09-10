-- 0105 — por que a IA disse aquilo
--
-- `ia_interacoes` guardava modelo, latência, versão do prompt e contadores de
-- anexo: tudo sobre a MECÂNICA da resposta, nada sobre a DECISÃO. Quem abre o
-- Live Chat para dar 👍/👎 julgava o texto sozinho, sem saber qual imóvel
-- estava em foco, o que o planner mandou fazer, o que a IA sabia do cliente
-- nem quanto do histórico chegou até ela.
--
-- NÃO é o prompt. Ele tem ~35 mil caracteres, é ilegível no celular e não
-- responde à pergunta do corretor. Aqui vai a decisão:
--
--   { foco:      { slug, nome } | null,
--     jogada:    { tipo, ... }              -- planejarJogada (jogada.ts)
--     dossie:    { regiao, dormitorios, orcamentoMax, rendaMensal,
--                  formaPagamento } | null, -- o que valia NO MOMENTO
--     historico: { total, doCliente, doBot, doCorretor, emBranco },
--     fewShot:   int }
--
-- `emBranco` é o campo que costuma explicar a queixa: conversa retravada
-- grava a linha sem o texto (0087/privacidadeDaConversa.ts), e sem esse
-- número "a IA não considerou o que eu disse" e "a IA não RECEBEU o que você
-- disse" são a mesma frase na tela — pedindo correções opostas.
--
-- Nulo é resposta legítima e comum. Playground, eval e consultor não têm
-- conversa real para descrever; e resposta anterior a esta migration nunca
-- vai ter contexto — reconstruir com o histórico de hoje mostraria uma razão
-- que não foi a real, porque dossiê e catálogo mudaram desde então.
--
-- Sem grant novo, e isso foi CONFERIDO, não suposto: quem escreve é o cliente
-- de serviço, e o `anon` não tem privilégio nesta tabela desde a varredura da
-- 0082. Coluna nova em tabela sem regime restritivo herda o grant da tabela —
-- por isso a conferência em information_schema vem antes de qualquer `grant`.

alter table public.ia_interacoes
  add column if not exists contexto jsonb;

comment on column public.ia_interacoes.contexto is
  'Por que a IA respondeu isso: foco, jogada do planner, dossiê do momento, contagem da janela de histórico e quantidade de few-shot. Escrito só pelo cliente de serviço. Nulo = não registrado (resposta antiga, playground, eval ou consultor).';
