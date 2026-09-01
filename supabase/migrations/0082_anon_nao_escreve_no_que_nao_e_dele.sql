-- 0082 — O `anon` só escreve nos dois lugares onde isso é o produto
--
-- ## O que a varredura achou
--
-- Levantado em `information_schema.table_privileges`: **30 das 31 tabelas
-- do schema `public` davam INSERT, UPDATE, DELETE e TRUNCATE ao `anon`** —
-- `leads` era a única exceção, e só porque a 0022 já tinha feito este
-- trabalho para ela. É o default do Supabase para tabela criada no
-- `public`, o mesmo que a 0077 encontrou nas views e a 0080 na fila de
-- candidatos. Aqui está a varredura inteira, de uma vez.
--
-- ## Isto era exploitable hoje?
--
-- Não, e a distinção importa para não exagerar o achado. A RLS segurava:
-- conferido em `pg_policies`, as ÚNICAS policies de escrita que o `anon`
-- alcança são duas, e as duas são intencionais — o formulário público de
-- lead (`leads`, 0001) e o registro de clique no WhatsApp
-- (`cliques_whatsapp`). Em todo o resto não existe policy que o `anon`
-- satisfaça, então o banco recusava.
--
-- O problema é que isso deixa UMA linha de defesa numa chave que vai no
-- bundle JavaScript do site POR DESENHO. Basta uma policy futura escrita
-- sem `to authenticated` — e este projeto tem policies assim, herdadas — e
-- a porta abre calada. Grant é a camada que não depende de ninguém lembrar.
--
-- ## O que fica
--
-- `leads`: INSERT (o formulário público). Já estava só assim.
-- `cliques_whatsapp`: INSERT (o clique do visitante em "falar no WhatsApp").
--
-- Tudo o mais que escreve — webhooks, crons, disparador, painel — usa a
-- service key ou a sessão do corretor, nunca a chave anônima. Conferido nos
-- arquivos: só `/api/leads` e `/api/clique-whatsapp` escrevem com o cliente
-- público.
--
-- SELECT fica intacto de propósito: é a vitrine, e quem a recorta é a RLS.

do $$
declare
  t record;
  -- Exceção DECLARADA, não descoberta por quem for ler depois. Mesma ideia
  -- da lista RESERVADOS de migrations.test.ts.
  guardadas constant text[] := array['leads', 'cliques_whatsapp'];
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> all (guardadas)
  loop
    execute format(
      'revoke insert, update, delete, truncate on public.%I from anon',
      t.tablename
    );
  end loop;
end $$;

-- `pg_tables` não lista VIEW, e as duas de métrica também nasceram com
-- grant de escrita para o `anon`. A 0077 tirou o SELECT delas e parou aí —
-- escrita em view de agregado falharia de qualquer jeito (não é
-- auto-updatable), mas grant que não deveria existir é grant que confunde
-- quem for auditar depois.
do $$
declare
  v record;
begin
  for v in select viewname from pg_views where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon', v.viewname);
  end loop;
end $$;

-- As duas que ficam: explícito é melhor que herdado do default.
revoke update, delete, truncate on public.leads from anon;
revoke update, delete, truncate on public.cliques_whatsapp from anon;
grant insert on public.leads to anon;
grant insert on public.cliques_whatsapp to anon;
