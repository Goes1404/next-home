-- 0083 — O imóvel sobre o qual o lead está CONVERSANDO
--
-- ## O buraco, medido
--
-- Dos 112 leads ativos, 32 têm `empreendimento_id` e **64 têm conversa de
-- WhatsApp sem imóvel nenhum vinculado**. O corretor abre a ficha e não
-- sabe do que a pessoa está falando — a informação mais básica para
-- retomar um atendimento.
--
-- E o pior: o sistema JÁ SABE. `focoDaConversa` calcula, a cada mensagem,
-- qual imóvel o cliente citou — é o que encolhe o catálogo do prompt para
-- ela parar de desfilar empreendimento. O dado é computado a toda resposta
-- e descartado.
--
-- ## Por que uma coluna NOVA, e não reusar `empreendimento_id`
--
-- Elas respondem perguntas diferentes e as duas importam:
--
-- - `empreendimento_id` é a ORIGEM: de qual página o lead preencheu o
--   formulário. É atribuição de marketing e não pode ser reescrita — quem
--   chegou pelo Terra Alta chegou pelo Terra Alta, mesmo que a conversa
--   tenha virado para outro imóvel.
-- - `imovel_interesse_id` é o ASSUNTO: sobre o que ele está falando AGORA.
--   Muda durante a conversa, e é isso que o corretor precisa ver.
--
-- Sobrescrever a origem com o assunto destruiria a única medida de qual
-- página traz cliente — o mesmo erro que a MEMORIA registra sobre o nome
-- do anúncio apagando a atribuição do passado.
--
-- ## Sem backfill, e o número é a razão
--
-- A tentação era preencher os 64 lendo as conversas antigas. Medido antes
-- de escrever o script: das 56 conversas com fala do cliente, **2 citam o
-- nome de um imóvel**, e **1 das 16 campanhas** tem empreendimento
-- vinculado. O histórico não carrega a informação — quase toda conversa da
-- base é disparo de campanha em que o cliente não respondeu.
--
-- Manter um script para preencher meia dúzia de linhas é o "código
-- especulativo" que esta casa já registrou como erro. O recurso vale para
-- frente, que é quando o piloto começa.
--
-- ## Por que coluna, e não conta na leitura
--
-- Recalcular o foco exigiria ler o histórico inteiro de cada conversa, por
-- lead, na lista paginada (30) e no quadro (até 300 cartões). É a mesma
-- razão dos contadores de tentativa de contato (0060): contador é barato de
-- ler, e o que ele guarda é FATO.

alter table public.leads
  add column if not exists imovel_interesse_id uuid
    references public.empreendimentos(id) on delete set null;

comment on column public.leads.imovel_interesse_id is
  'O imovel sobre o qual a conversa esta acontecendo (focoDaConversa). Diferente de empreendimento_id, que e a ORIGEM do lead e nao se reescreve (0083).';

-- A lista filtra por "quem está falando do imóvel X" — é o recorte que
-- monta campanha e que o corretor usa para priorizar.
create index if not exists leads_imovel_interesse_idx
  on public.leads (imovel_interesse_id)
  where imovel_interesse_id is not null;

-- `leads` está sob o regime restritivo da 0007: `revoke update` e grant
-- coluna a coluna. Sem isto, a policy passa e o update afeta 0 linhas em
-- silêncio — o defeito que a MEMORIA registra como armadilha desta tabela.
--
-- O corretor PODE corrigir: o foco é heurística sobre texto livre, e quem
-- fala com o cliente sabe melhor. Diferente da atribuição de anúncio, que
-- não ganha grant justamente por ser o dado que diz de onde veio um lead pago.
grant update (imovel_interesse_id) on public.leads to authenticated;
