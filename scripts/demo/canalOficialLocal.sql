-- Telas do NÚMERO OFICIAL (0255) com dados de exemplo — SÓ NO BANCO LOCAL.
--
-- Para fotografar ou revisar as telas do canal oficial sem produção
-- (04/11/2026). Pessoas, telefones e conversas são inventados; a senha das
-- duas contas é de teste. Passo a passo e armadilhas no vault:
-- vault/10-notas/painel-local-com-dados-de-exemplo.md
--
--   npm run db:teste                       (banco do zero, migrations até a 0255)
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -v ON_ERROR_STOP=1 -f scripts/demo/canalOficialLocal.sql
--
-- Entra no grupo da Next Home (o piloto). Contas:
--   gestora.demo@nexthome.test / corretor.demo@nexthome.test — Demo-Local-2026!
--
-- NUNCA no Supabase de produção: a trava abaixo recusa banco que já tem
-- corretor cadastrado (o de teste nasce vazio).

do $$
begin
  if exists (select 1 from public.corretores) then
    raise exception 'canalOficialLocal.sql é só para o banco de teste recém-criado (npm run db:teste): este já tem corretores.';
  end if;
end $$;

begin;

-- 1. Gestora e corretor de teste (mesma forma de src/lib/grupos/apoioDoBanco.ts)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'gestora.demo@nexthome.test', extensions.crypt('Demo-Local-2026!', extensions.gen_salt('bf', 10)), now(),
   jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'senha_trocada_em', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')),
   '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'corretor.demo@nexthome.test', extensions.crypt('Demo-Local-2026!', extensions.gen_salt('bf', 10)), now(),
   jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'senha_trocada_em', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')),
   '{}'::jsonb, now(), now(), '', '', '', '');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.id in ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002');

insert into public.corretores (id, nome, creci, whatsapp, email, slug, papel, user_id, grupo_id) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Ana Ribeiro', '123456-F', '5511911110001', 'gestora.demo@nexthome.test',
   'ana-ribeiro-demo', 'gestor', 'aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Bruno Lima', '654321-F', '5511911110002', 'corretor.demo@nexthome.test',
   'bruno-lima-demo', 'corretor', 'aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001');

-- 2. O número oficial da imobiliária (cadastrado à mão, como no piloto)
insert into public.whatsapp_numeros_oficiais (
  id, grupo_id, waba_id, phone_number_id, numero, nome_exibicao, estado, limite_de_envio, qualidade,
  atualizado_na_meta_em, liberado_para_corretores, teto_mensal, resposta, origem, conectado_por, created_at
) values (
  'cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', '100000000000001', '100000000000002',
  '5511930000000', 'Next Home Imóveis', 'ativo', 'TIER_1K', 'GREEN', now() - interval '2 hours', true, 2000, 'ia',
  'manual', 'bbbbbbbb-0000-4000-8000-000000000001', now() - interval '6 days'
);

-- 3. Modelos: aprovado, em análise e rascunho
insert into public.whatsapp_modelos_oficiais (
  id, grupo_id, numero_oficial_id, nome, categoria, corpo, exemplos, cabecalho, cabecalho_texto, cabecalho_imagem_url,
  rodape, botoes, meta_id, estado, qualidade, criado_por, enviado_em, created_at, atualizado_em
) values
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'lancamento_com_foto', 'MARKETING',
   'Oi, {{nome}}! Aqui é da {{casa}}. O {{imovel}} abriu a tabela de lançamento, com apartamentos de 2 e 3 quartos. Quer que eu te mande as fotos e os valores?',
   '{"nome":"Carla","casa":"Next Home","imovel":"Terrah Alphaville"}'::jsonb, 'imagem', null,
   'http://localhost:3000/empreendimentos/eternity-alphaville/fachada.jpg', 'Next Home Imóveis',
   '[{"tipo":"interesse","texto":"Quero ver"},{"tipo":"parar","texto":"Parar de receber"}]'::jsonb,
   '900000000000001', 'aprovado', 'GREEN', 'bbbbbbbb-0000-4000-8000-000000000001',
   now() - interval '5 days', now() - interval '5 days', now() - interval '5 days'),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'convite_decorado', 'MARKETING',
   'Olá, {{nome}}! Neste sábado o decorado do {{imovel}} fica aberto das 10h às 16h. Quer que eu reserve um horário para você?',
   '{"nome":"Carla","imovel":"Terrah Alphaville"}'::jsonb, 'texto', 'Decorado aberto no sábado', null, 'Next Home Imóveis',
   '[{"tipo":"interesse","texto":"Reservar horário"},{"tipo":"parar","texto":"Parar de receber"}]'::jsonb,
   '900000000000002', 'em_analise', null, 'bbbbbbbb-0000-4000-8000-000000000001',
   now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours'),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'novidades_da_semana', 'MARKETING',
   'Oi, {{nome}}! Separei os imóveis novos da semana na sua faixa. Quer receber a lista?',
   '{"nome":"Carla"}'::jsonb, 'nenhum', null, null, null,
   '[{"tipo":"interesse","texto":"Quero a lista"},{"tipo":"parar","texto":"Parar de receber"}]'::jsonb,
   null, 'rascunho', null, 'bbbbbbbb-0000-4000-8000-000000000001',
   null, now() - interval '1 hour', now() - interval '1 hour');

-- 4. Leads do corretor (inventados). O primeiro é a Carla, que respondeu.
create temp table demo_nomes(i int, nome text) on commit drop;
insert into demo_nomes values
  (1,'Carla Mendes'),(2,'Rafael Souza'),(3,'Juliana Alves'),(4,'Marcos Pereira'),(5,'Patrícia Gomes'),
  (6,'Felipe Rocha'),(7,'Larissa Costa'),(8,'Gustavo Martins'),(9,'Renata Dias'),(10,'Thiago Carvalho'),
  (11,'Beatriz Nunes'),(12,'Eduardo Freitas'),(13,'Camila Barros'),(14,'Leonardo Teixeira'),(15,'Aline Moreira'),
  (16,'Rodrigo Pinto'),(17,'Fernanda Cardoso'),(18,'Diego Araújo'),(19,'Vanessa Ramos'),(20,'André Castro'),
  (21,'Priscila Monteiro'),(22,'Lucas Fernandes'),(23,'Natália Lopes'),(24,'Bruno Azevedo'),(25,'Tatiane Melo'),
  (26,'Vinícius Correia'),(27,'Débora Cunha'),(28,'Fábio Batista'),(29,'Simone Vieira'),(30,'Ricardo Duarte'),
  (31,'Mariana Farias'),(32,'Henrique Moura'),(33,'Cristina Campos'),(34,'Daniel Rezende'),(35,'Elaine Prado'),
  (36,'Paulo Siqueira'),(37,'Sabrina Lacerda'),(38,'Mateus Viana'),(39,'Gabriela Peixoto'),(40,'Otávio Brandão');

insert into public.leads (
  id, nome, telefone, email, origem, consentimento_lgpd, corretor_id, grupo_id, trazido_por, etapa,
  empreendimento_id, created_at
)
select
  ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  nome,
  '(11) 9' || lpad((80000000 + i * 1371)::text, 8, '0'),
  null, 'site', true, 'bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'corretor',
  case when i = 1 then 'em_conversa' else 'novo' end,
  (select id from public.empreendimentos where slug = 'terrah-alphaville'), now() - interval '20 days' + (i || ' minutes')::interval
from demo_nomes where i <= 40;

-- 5. Autorização de ofertas pelo WhatsApp (a régua: só recebe quem autorizou)
select public.registrar_consentimento_marketing_whatsapp(
  ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, true, 'formulario_site')
from demo_nomes;
update public.marketing_consentimentos set ocorrido_em = now() - interval '19 days', criado_em = now() - interval '19 days'
where lead_id::text like 'eeeeeeee-0000-4000-8000-%';

-- 6. Uma lista oficial já enviada (para a Medição do piloto)
insert into public.whatsapp_campanhas (
  id, corretor_id, titulo, empreendimento_id, mensagem_base, total_leads, total_enviados, total_respondidos, status,
  created_at, grupo_id, canal, numero_oficial_id, modelo_oficial_id
) values (
  'ffffffff-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'Lançamento Terrah Alphaville',
  (select id from public.empreendimentos where slug = 'terrah-alphaville'),
  'Oi, {{nome}}! Aqui é da {{casa}}. O {{imovel}} abriu a tabela de lançamento, com apartamentos de 2 e 3 quartos. Quer que eu te mande as fotos e os valores?',
  40, 38, 6, 'concluida', now() - interval '2 days', '00000000-0000-0000-0000-000000000001', 'oficial',
  'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001'
);

insert into public.whatsapp_campanhas_fila (
  campanha_id, lead_id, telefone, mensagem_personalizada, status, agendado_para, enviado_em, resposta_em,
  erro_motivo, grupo_id, wamid, entregue_em, lido_em, erro_meta_codigo, cobranca_categoria, cobrada, created_at
)
select
  'ffffffff-0000-4000-8000-000000000001',
  ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '55119' || lpad((80000000 + i * 1371)::text, 8, '0'),
  'modelo lancamento_com_foto',
  case when i <= 6 then 'respondido' when i >= 39 then 'erro' else 'enviado' end,
  now() - interval '2 days',
  case when i >= 39 then null else now() - interval '2 days' + (i || ' seconds')::interval end,
  case when i <= 6 then now() - interval '2 days' + interval '40 minutes' + (i || ' minutes')::interval end,
  case when i >= 39 then 'A Meta não entregou: número sem WhatsApp.' end,
  '00000000-0000-0000-0000-000000000001',
  case when i >= 39 then null else 'wamid.DEMO' || i end,
  case when i <= 36 then now() - interval '2 days' + interval '1 minute' end,
  case when i <= 29 then now() - interval '2 days' + interval '10 minutes' end,
  case when i >= 39 then 131026 end,
  case when i <= 36 then 'marketing' end,
  case when i <= 36 then true end,
  now() - interval '2 days'
from demo_nomes;

-- Um tocou em "Parar de receber" e uma visita foi marcada a partir da lista
select public.registrar_consentimento_marketing_whatsapp('eeeeeeee-0000-4000-8000-000000000012', false, 'botao_parar');
insert into public.visitas (grupo_id, lead_id, corretor_id, inicio, fim, status, created_at)
values ('00000000-0000-0000-0000-000000000001', 'eeeeeeee-0000-4000-8000-000000000003',
        'bbbbbbbb-0000-4000-8000-000000000002', date_trunc('day', now()) + interval '3 days 14 hours',
        date_trunc('day', now()) + interval '3 days 15 hours', 'marcada', now() - interval '1 day');

-- 7. A conversa da Carla pelo número oficial (a IA atendendo; janela aberta)
insert into public.whatsapp_oficial_conversas (
  id, grupo_id, numero_oficial_id, telefone, lead_id, corretor_id, nome_cliente, janela_ate, ultima_mensagem,
  ultima_interacao_em, ia_ativa, avisado_em, created_at
) values (
  '99999999-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
  '5511980001371', 'eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'Carla Mendes',
  now() + interval '20 hours', 'Pode ser no sábado de manhã?', now() - interval '4 hours', true,
  now() - interval '4 hours 30 minutes', now() - interval '2 days'
);

insert into public.whatsapp_oficial_mensagens (grupo_id, conversa_id, remetente, tipo, conteudo, status_entrega, cobranca_categoria, cobrada, created_at) values
  ('00000000-0000-0000-0000-000000000001', '99999999-0000-4000-8000-000000000001', 'sistema', 'modelo',
   'Oi, Carla! Aqui é da Next Home. O Terrah Alphaville abriu a tabela de lançamento, com apartamentos de 2 e 3 quartos. Quer que eu te mande as fotos e os valores?',
   'lida', 'marketing', true, now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '99999999-0000-4000-8000-000000000001', 'cliente', 'botao', 'Quero ver', null, null, null,
   now() - interval '4 hours 40 minutes'),
  ('00000000-0000-0000-0000-000000000001', '99999999-0000-4000-8000-000000000001', 'bot', 'texto',
   'Que bom, Carla! O Terrah tem plantas de 2 quartos (64 m²) e 3 quartos (82 m²), com lazer completo. Você procura para morar ou investir?',
   'lida', null, null, now() - interval '4 hours 39 minutes'),
  ('00000000-0000-0000-0000-000000000001', '99999999-0000-4000-8000-000000000001', 'cliente', 'texto',
   'Para morar. Queria ver o decorado.', null, null, null, now() - interval '4 hours 20 minutes'),
  ('00000000-0000-0000-0000-000000000001', '99999999-0000-4000-8000-000000000001', 'bot', 'texto',
   'Perfeito! O Bruno, corretor que cuida do seu atendimento, pode te levar ao decorado. Qual dia fica melhor para você?',
   'entregue', null, null, now() - interval '4 hours 19 minutes'),
  ('00000000-0000-0000-0000-000000000001', '99999999-0000-4000-8000-000000000001', 'cliente', 'texto',
   'Pode ser no sábado de manhã?', null, null, null, now() - interval '4 hours');

-- 8. Uma lista comum (pelo WhatsApp do corretor) no mesmo período: a Medição
--    compara a taxa de resposta das duas.
insert into public.whatsapp_campanhas (id, corretor_id, titulo, mensagem_base, total_leads, total_enviados, total_respondidos, status, created_at, grupo_id, canal)
values ('ffffffff-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Reativação de outubro',
        'Oi {nome}, tudo bem? Ainda procurando imóvel?', 40, 40, 3, 'concluida', now() - interval '1 day',
        '00000000-0000-0000-0000-000000000001', 'evolution');
insert into public.whatsapp_campanhas_fila (campanha_id, lead_id, telefone, mensagem_personalizada, status, enviado_em, grupo_id, created_at)
select 'ffffffff-0000-4000-8000-000000000002', ('eeeeeeee-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       '55119' || lpad((80000000 + g * 1371)::text, 8, '0'), 'Oi, tudo bem? Ainda procurando imóvel?',
       case when g <= 3 then 'respondido' else 'enviado' end, now() - interval '1 day', '00000000-0000-0000-0000-000000000001', now() - interval '1 day'
from generate_series(1, 40) g;

-- 9. Clientes que nunca receberam lista (os 40 acima ficam "protegidos" por 7
--    dias): 22 autorizaram ofertas e 3 não — a tela da lista mostra o filtro.
insert into demo_nomes values
  (41,'Helena Barbosa'),(42,'Igor Santana'),(43,'Jéssica Moraes'),(44,'Kaio Ribeiro'),(45,'Lívia Antunes'),
  (46,'Murilo Tavares'),(47,'Nathalia Fontes'),(48,'Orlando Paiva'),(49,'Paula Xavier'),(50,'Quintino Leal'),
  (51,'Rebeca Sales'),(52,'Samuel Dantas'),(53,'Talita Guerra'),(54,'Ulisses Neves'),(55,'Valéria Pires'),
  (56,'Wagner Lima'),(57,'Yasmin Rocha'),(58,'Zeca Moreno'),(59,'Amanda Couto'),(60,'Bernardo Assis'),
  (61,'Carolina Rangel'),(62,'Davi Bastos'),(63,'Elisa Fagundes'),(64,'Flávio Nogueira'),(65,'Giovana Matos');
insert into public.leads (id, nome, telefone, origem, consentimento_lgpd, corretor_id, grupo_id, trazido_por, etapa, empreendimento_id, created_at)
select ('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, nome,
       '(11) 9' || lpad((80000000 + i * 1371)::text, 8, '0'), 'site', true,
       'bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'corretor', 'novo',
       (select id from public.empreendimentos where slug = 'terrah-alphaville'), now() - interval '25 days' + (i || ' minutes')::interval
from demo_nomes where i > 40;
select public.registrar_consentimento_marketing_whatsapp(('eeeeeeee-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, true, 'formulario_site')
from demo_nomes where i between 41 and 62;

commit;
