-- 0036 — O catálogo do corretor vira o link da plataforma
--
-- A 0035 tinha criado colunas e bucket para um catálogo em PDF, e chegou a
-- rodar em produção. O corretor corrigiu o rumo: o catálogo dele JÁ EXISTE e
-- é a página dele na plataforma — `/?corretor=<slug>`, que o `proxy.ts`
-- resolve levando ao catálogo com aquele corretor vinculado.
--
-- É melhor que o arquivo por três motivos: nunca desatualiza, não precisa de
-- upload, e o cliente navega pelos imóveis com foto, planta e mapa em vez de
-- rolar um PDF no celular.
--
-- Some, então, o que a 0035 criou para o arquivo. Schema morto não é neutro:
-- quem ler depois vai procurar quem escreve nessas colunas e não vai achar
-- ninguém — o mesmo defeito de `historico_envios`, 53 linhas e zero leitores.

drop policy if exists "catalogo corretor leitura publica" on storage.objects;
drop policy if exists "catalogo corretor escreve o proprio" on storage.objects;
drop policy if exists "catalogo corretor atualiza o proprio" on storage.objects;
drop policy if exists "catalogo corretor apaga o proprio" on storage.objects;

alter table public.corretores
  drop column if exists catalogo_url,
  drop column if exists catalogo_nome;

-- O BUCKET `corretores` FICA, e não por escolha: o Supabase recusa
-- `delete from storage.buckets` ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead"). Ele nunca recebeu arquivo e agora
-- está sem policy nenhuma, então é inerte — para removê-lo de vez, é pelo
-- painel de Storage ou pela Storage API.
