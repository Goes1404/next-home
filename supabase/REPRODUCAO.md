# Banco local reproduzível a partir das migrations

## PENDENTE: conferência contra produção (passo 4 da Task 1)

**Não feita.** Precisa de acesso ao banco de produção que esta sessão não
tem: nem `SUPABASE_PAT` nem URL do banco estão no `.env`/`.env.local`, e a
regra da fase proíbe usar as chaves do app contra produção. Fica com o
Matheus.

Como fazer, quando houver acesso:

1. Rodar a MESMA consulta nos dois bancos. Ela só lê catálogo (tabelas,
   colunas, policies, funções, gatilhos, grants do `anon`/`authenticated`,
   buckets), nenhuma linha de cliente, e devolve uma linha por objeto já
   ordenada:

   ```bash
   # local (com `npm run db:teste` de pé)
   docker exec -i supabase_db_next-home-teste psql -U postgres -At \
     < scripts/banco/inventario.sql > inventario-local.txt
   ```

   Em produção, colar `scripts/banco/inventario.sql` no editor SQL do painel
   (projeto `prhhrqyubjcafvucirri`) e exportar o resultado, ou mandar pela
   Management API (`POST /v1/projects/prhhrqyubjcafvucirri/database/query`
   com o `SUPABASE_PAT`; o Python local falha o TLS dessa API, o `curl`
   passa). Salvar como `inventario-producao.txt`.

2. `diff inventario-producao.txt inventario-local.txt`. Conferir também
   `show server_version;` nos dois (local: 17.11; `major_version` em
   `config.toml` tem de ser o de produção).

3. Cada diferença vira uma linha na tabela de edições abaixo e entra numa
   migration de reconciliação `0159_*`, aplicada ANTES das migrations da
   fase (renumerando as seguintes; conferir `origin/*` antes, colisão de
   número já aconteceu duas vezes).

### Candidatos conhecidos, a conferir primeiro

Levantados lendo o repositório; nenhum foi confirmado contra produção.

- **Quatro policies que podem existir só em produção.** O
  `supabase/migrations_pendentes.sql` (script consolidado das 0014–0021,
  colado no editor SQL em 08/2026, nunca lido pelo CLI) cria policies com
  nomes diferentes dos das migrations. Quatro delas não existem no banco
  local e nenhuma migration as derruba:
  - `lead_observacoes_ia`: "Corretores leem dossie de seus leads" (select) e
    "Corretores atualizam dossie de seus leads" (all), as duas com
    `or ... papel = 'gestor'`;
  - `whatsapp_campanhas_fila`: "Corretores gerenciam fila de suas campanhas"
    (all, com `or ... papel = 'gestor'`);
  - `whatsapp_mensagens`: "Corretores criam mensagens em suas conversas"
    (insert).

  Como a RLS soma policies por OR, se existirem em produção elas abrem
  acesso que o banco local não tem, e isso importa diretamente para o
  isolamento entre grupos. As outras quatro policies do script com nome
  próprio foram derrubadas pela 0031/0134 (`drop policy if exists`).
- **Bucket `empreendimentos`**: criado em produção pelo painel. Entrou no
  banco local pela edição da 0043 (abaixo) com `public = true` e 50 MB, que
  é o estado registrado na MEMORIA (11/09 e 13/09/2026). Conferir na saída
  da consulta (`bucket | empreendimentos`).
- **Versão do Postgres** (`major_version = 17` no `config.toml`).
- **Extensões**: o banco local tem `pg_cron`, `pg_net`,
  `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`,
  `uuid-ossp`.

### Diferenças esperadas, que NÃO viram migration

- **Jobs do `pg_cron` e segredos do Vault.** Em produção eles nascem de
  chamadas manuais a `configurar_*` (com a URL de produção e o
  `CRON_SECRET`), não de migration. O banco de teste não deve tê-los: um job
  local chamaria as rotas de produção.
- **Dados.** Migrations que só mexem em linhas de produção (despublicar
  duplicados, apagar conversas sem lead, carimbar backfills) rodam como
  no-op num banco vazio. O esquema resultante é o mesmo.

## Como usar

```bash
npm run db:teste         # sobe o Docker local e aplica as migrations do zero
npm run db:teste:parar   # derruba e APAGA o volume
```

`db:teste` termina imprimindo
`DB_TESTE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
Testes que dependem de banco ficam em `*.db.test.ts` e pulam sem essa
variável, então `npm test` continua rodando sem Docker.

- CLI fixo em `supabase@2.121.0` (`scripts/banco/dbTeste.mjs`); imagem do
  Postgres `17.11.0.004`. A primeira subida baixa ~4 GB de imagens.
- `project_id = "next-home-teste"`: os containers se chamam
  `supabase_*_next-home-teste` e não colidem com outro projeto local.
- Ficam de fora os serviços que nenhum teste usa (realtime, studio,
  imgproxy, edge-runtime, logflare, vector, supavisor, mailpit,
  postgres-meta). Auth, storage, PostgREST e Kong sobem.
- Parar apaga o volume de propósito: a próxima subida aplica tudo num banco
  vazio de novo, e é isso que prova que as migrations reproduzem o esquema.
- O CLI aceita o prefixo numérico como versão: `0001_init.sql` vira a
  versão `0001` em `supabase_migrations.schema_migrations` (conferido: 158
  linhas, de `0001` a `0158`).
- **Seed desligado** (`[db.seed] enabled = false`): o `seed.sql` é de
  08/2026 e grava `empreendimentos.corretor_id`, coluna que a 0129 apagou.

## Resultado (19/10/2026)

As 158 migrations aplicaram num banco vazio **na primeira tentativa**, sem
nenhum erro. O esperado era falhar em alguma: não falhou. Conferido duas
vezes do zero (`db:teste:parar` + `db:teste`), as duas com as 158 versões
gravadas.

Aplicar sem erro não bastou: a busca por objetos que só existem em produção
achou uma migration cujo efeito dependia de um deles (a 0043, abaixo), sem
dar erro. `update` sem linha é sucesso para o Postgres.

## Edições em migrations antigas

Regra: a menor edição que deixa o banco local igual ao de produção, sem
mudar o efeito da migration em produção (onde ela já rodou e nunca roda de
novo).

| Arquivo | Linha | Erro | Motivo e edição |
|---|---|---|---|
| `0043_storage_midia_empreendimento.sql` | 45–53 | Nenhum erro: o `update storage.buckets ... where id = 'empreendimentos'` não acha linha num banco vazio e passa calado. O mesmo acontece no `update` da 0108. | O bucket foi criado em produção pelo painel, fora de migration. Acrescentado, antes do `update`, `insert into storage.buckets (id, name, public, file_size_limit) values ('empreendimentos', 'empreendimentos', true, 52428800) on conflict (id) do nothing`. Em produção é no-op; no banco local o bucket passa a existir e a 0043/0108 fecham com os cinco tipos e 50 MB, o estado de produção registrado na MEMORIA. |
