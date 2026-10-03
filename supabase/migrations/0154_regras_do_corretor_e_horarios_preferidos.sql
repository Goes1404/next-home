-- 0154: as regras do corretor para a IA e os horários que ela oferece primeiro.
--
-- Achado no anúncio do Dom Parque (02/10/2026): a corretora escreveu as
-- instruções para a IA DENTRO do chat da cliente ("Você precisa passar as
-- informações do Dom Parque...", "Sempre sugerir no sábado às 10h ou 14h"),
-- e a cliente recebeu. Não existia lugar para isso.
--
-- 1. `regras_da_ia`: texto livre do corretor, que entra no prompt dele.
-- 2. `horas_preferidas`: por dia da grade de visitas, as horas que a IA
--    oferece PRIMEIRO. Estruturado, e não texto, porque a lista de horários
--    do prompt diz "só estes existem": uma regra em texto pedindo sábado às
--    10h brigaria com uma lista que não tem sábado às 10h.
--
-- Seed com as regras que a Bruna escreveu no chat, e o lead que pediu para
-- apagar o contato (29/09) ganha a marca de não contatar que o detector
-- deixou passar.

alter table public.corretor_whatsapp_instancias
  add column if not exists regras_da_ia text;

alter table public.corretor_whatsapp_instancias
  drop constraint if exists corretor_whatsapp_instancias_regras_da_ia_tamanho;
alter table public.corretor_whatsapp_instancias
  add constraint corretor_whatsapp_instancias_regras_da_ia_tamanho
  check (regras_da_ia is null or char_length(regras_da_ia) <= 1500);

alter table public.corretor_disponibilidade
  add column if not exists horas_preferidas smallint[] not null default '{}';

alter table public.corretor_disponibilidade
  drop constraint if exists corretor_disponibilidade_horas_preferidas_validas;
alter table public.corretor_disponibilidade
  add constraint corretor_disponibilidade_horas_preferidas_validas
  check (
    cardinality(horas_preferidas) <= 4
    and horas_preferidas <@ array[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]::smallint[]
  );

comment on column public.corretor_whatsapp_instancias.regras_da_ia is
  'Regras do corretor para a IA dele (0154). Entram no prompt abaixo das regras de segurança.';
comment on column public.corretor_disponibilidade.horas_preferidas is
  'Horas deste dia que a IA oferece primeiro (0154). Vazio = ela escolhe pela grade.';

-- As regras da Bruna, nas palavras dela.
update public.corretor_whatsapp_instancias
set regras_da_ia =
  'Na primeira resposta sobre o imóvel, passe as informações dele: a localização e as opções de planta, e termine perguntando se o cliente tem interesse na planta de 1, 2 ou 3 dormitórios.' || E'\n' ||
  'Quando perguntarem o valor, diga que é a partir do valor da ficha e que varia conforme a unidade, e termine perguntando a renda familiar, para indicar a melhor metragem.'
where corretor_id = '2fbb3334-fbe6-49c4-acbe-82f66f5a0515'
  and regras_da_ia is null;

-- "Sempre sugerir no sábado às 10h ou às 14h."
update public.corretor_disponibilidade
set horas_preferidas = '{10,14}'
where corretor_id = '2fbb3334-fbe6-49c4-acbe-82f66f5a0515'
  and dia_semana = 6
  and hora_inicio <= 10
  and hora_fim > 14;

-- "Eu quero te apagar meu contato" (29/09/2026, 21h02 de Brasília).
update public.whatsapp_conversas
set bot_ativo = false
where lead_id = 'ba50111d-12cb-4fbb-a9cf-c2fdd97ec42e';

update public.leads
set nao_contatar_em = '2026-09-30 00:02:00+00',
    nao_contatar_motivo = 'parada',
    etapa = 'perdido',
    etapa_alterada_em = now()
where id = 'ba50111d-12cb-4fbb-a9cf-c2fdd97ec42e'
  and nao_contatar_em is null;

insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo)
select 'ba50111d-12cb-4fbb-a9cf-c2fdd97ec42e', null, 'sistema',
  'O cliente pediu para apagar o contato (29/09). A IA foi silenciada e ele saiu das campanhas.'
where exists (select 1 from public.leads where id = 'ba50111d-12cb-4fbb-a9cf-c2fdd97ec42e')
  and not exists (
    select 1 from public.lead_interacoes
    where lead_id = 'ba50111d-12cb-4fbb-a9cf-c2fdd97ec42e'
      and conteudo like 'O cliente pediu para apagar o contato%'
  );
