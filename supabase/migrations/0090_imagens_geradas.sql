-- 0090 — As imagens que o corretor cria
--
-- ## O que esta tabela NÃO é
--
-- Ela não é `midias`. Imagem gerada por IA não entra no catálogo do imóvel, e
-- isso é decisão de produto com consequência técnica direta: o guardrail do
-- atendimento só libera anexo que esteja em `midias` (`resolverMidia.ts`),
-- então ficar fora dali é o que garante que a assistente nunca envie por conta
-- própria uma imagem que não retrata o imóvel de verdade. O corretor anexa à
-- mão no Live Chat se quiser — aí quem decide é uma pessoa que sabe o que a
-- imagem é.
--
-- Pelo mesmo motivo ela não aparece na vitrine pública: a vitrine lê `midias`.
--
-- ## É galeria E telemetria
--
-- `prompt`, `modelo` e `latencia_ms` moram aqui em vez de em `ia_interacoes`
-- de propósito: aquela tabela tem CHECK constraint em `origem` e é quente
-- (1.500+ linhas de atendimento). Uma tabela nova custa menos que uma
-- migration numa tabela que o webhook escreve a cada mensagem.
--
-- ## O teto diário vive na contagem desta tabela
--
-- Geração é a única coisa do painel que custa dinheiro POR CLIQUE. O limite é
-- contado aqui mesmo (`created_at` do dia), no mesmo lugar onde a linha nasce
-- — sem coluna de contador para divergir do fato.

create table if not exists public.imagens_geradas (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  prompt text not null,
  modelo text not null,
  url text not null,
  largura int,
  altura int,
  -- Quando a imagem nasceu de outra: é o que permite reconstruir a iteração.
  referencia_url text,
  latencia_ms int,
  created_at timestamptz not null default now()
);

-- A consulta da galeria e a do teto diário são a mesma forma: as minhas, mais
-- recentes primeiro.
create index if not exists imagens_geradas_corretor_idx
  on public.imagens_geradas (corretor_id, created_at desc);

alter table public.imagens_geradas enable row level security;

-- Cada corretor vê e apaga só o que é dele. Escrita é do servidor (a rota usa
-- o cliente de serviço): sem policy de INSERT para `authenticated`, ninguém
-- forja uma linha pela API pública dizendo ter gerado o que não gerou.
create policy "corretor le as proprias imagens"
  on public.imagens_geradas for select to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor apaga as proprias imagens"
  on public.imagens_geradas for delete to authenticated
  using (corretor_id = public.corretor_atual());

-- Os dois passos que a 0077 e a 0082 tornaram obrigatórios: tabela nova no
-- schema `public` do Supabase NASCE com grant para `anon`, e a chave `anon` vai
-- no bundle do site por desenho. A RLS já barraria, mas ficar com uma linha de
-- defesa só é como se abre uma porta calada quando alguém escrever uma policy
-- futura sem `to authenticated`.
revoke all on public.imagens_geradas from anon;
revoke insert, update, truncate on public.imagens_geradas from authenticated;

comment on table public.imagens_geradas is
  'Imagens criadas pelo corretor com IA. NAO e catalogo: nao entra em midias, nao aparece na vitrine e a assistente nao pode envia-las (0090).';
