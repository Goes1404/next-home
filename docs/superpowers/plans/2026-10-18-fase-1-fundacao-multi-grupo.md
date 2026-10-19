# Fase 1 — Fundação multi-grupo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo dado do banco passa a pertencer a um grupo, a Next Home vira o
grupo 1 sem parar a produção, e um teste automático prova que um usuário de
um grupo não lê nem escreve dado de outro.

**Architecture:** Uma tabela `grupos` e uma coluna `grupo_id` em toda tabela
de dados. A coluna é preenchida por um gatilho que a deriva da linha-mãe
(lead, conversa, corretor, imóvel), então quase nenhum código de aplicação
muda. O isolamento entra como **uma policy RESTRICTIVE por tabela**
(`grupo_id = grupo_atual()`), que se soma por AND às policies que já existem,
em vez de reescrever cada uma. Funções `security definer` e usos da chave de
serviço, onde a RLS não protege, são auditados um a um e travados por guardas
que leem o código. Um banco Supabase local, criado do zero a partir das
migrations, roda a suíte de isolamento no CI.

**Tech Stack:** Next.js (deste repositório; ler `node_modules/next/dist/docs/`
antes de mexer em rota), Supabase/Postgres, Supabase CLI via `npx`, Docker,
vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
(§2, §12, §13 fase 1, §14). Ler também `docs/MEMORIA.md` (seções de banco,
grants e "Revisão de segurança: view não herda RLS").

## Global Constraints

- O banco de produção (`prhhrqyubjcafvucirri`, `ca-central-1`) fica onde está.
- A Next Home nunca para: cada migration aplicada em produção deixa o código
  em produção funcionando antes e depois do deploy que vem em seguida.
- Grupo da Next Home tem id fixo `00000000-0000-0000-0000-000000000001`,
  nome `Next Home`, slug `next-home`, tipo `imobiliaria`.
- Dois papéis dentro do grupo: `gestor` e `corretor`. Um login, um grupo.
- Nenhum dado de um grupo aparece para outro (spec §2). Nesta fase isso vale
  para o usuário logado; a leitura pública pela chave `anon` é tratada na
  fase 3 (spec §15) e **nenhum grupo externo entra antes dela**.
- Migrations novas numeradas a partir de `0159`, conferindo contra
  `origin/*` antes de criar (colisão já aconteceu duas vezes).
- Tabela nova: `revoke all ... from anon` e `from authenticated` antes de
  qualquer grant (guarda `tabelasSeguras.test.ts`). View nova: `revoke` do
  `anon` e `security_invoker = on` (guarda `viewsSeguras.test.ts`).
- Gatilho que roda antes de `leads_distribuir` precisa de nome que ordene
  antes dele: os gatilhos de grupo se chamam `<tabela>_00_grupo`.
- Toda guarda nova é provocada uma vez (mordida conferida por md5) antes do
  commit.
- Testes que dependem de banco ficam em `*.db.test.ts` e pulam sem
  `DB_TESTE_URL`; `npm test` continua rodando sem Docker.
- Comentários e mensagens em português, no estilo do código vizinho.

## Review Focus

1. **Insert pela chave de serviço numa tabela sem linha-mãe, com dois grupos
   existindo** (webhook de portal, métrica da Meta, outbox): tem de falhar em
   voz alta, nunca cair calado no grupo da Next Home. → teste em Task 3.
2. **Mudar o dono de uma linha para alguém de outro grupo** (ex.: `update
   leads set corretor_id = <corretor do grupo B>` feito por gestor do grupo A,
   ou pela roleta): o gatilho recusa, porque o grupo da linha-mãe diverge. →
   teste em Task 3.
3. **Roleta e porteiro sem ninguém conectado no grupo**: o lead fica sem dono
   dentro do grupo; nunca vai para corretor de outro grupo. → teste em Task 5.
4. **Gestor do grupo B chamando funções de gestor** (`definir_papel_corretor`,
   excluir lead, desconectar número) sobre gente do grupo A. → teste em Task 5.
5. **Chave única de negócio global** (hash de mídia, slug): o upload do grupo
   B não pode ser rejeitado como "duplicado" de um arquivo do grupo A. →
   teste em Task 4.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/config.toml` | Projeto local do Supabase CLI |
| `supabase/REPRODUCAO.md` | Toda edição feita em migration antiga para ela aplicar do zero, com o motivo |
| `scripts/banco/dbTeste.mjs` | Sobe o banco local, aplica as migrations e imprime `DB_TESTE_URL` |
| `supabase/migrations/0159_grupos.sql` | Tabela `grupos`, grupo 1, `corretores.grupo_id`, `grupo_atual()` |
| `supabase/migrations/0160_grupo_em_todas_as_tabelas.sql` | `grupo_id` + backfill + índice + gatilho `<tabela>_00_grupo` |
| `supabase/migrations/0161_funcoes_respeitam_grupo.sql` | Funções `security definer` e chaves únicas escopadas por grupo |
| `supabase/migrations/0162_isolamento_por_grupo.sql` | Policies restritivas e policies de Storage |
| `src/lib/grupos/grupo.ts` | Constante do grupo 1 e quem decide o grupo nas portas de entrada |
| `src/lib/grupos/tabelasDoGrupo.ts` | Lista declarada de tabelas globais (sem `grupo_id`) |
| `src/lib/grupos/isolamento.db.test.ts` | Suíte de isolamento contra o banco local |
| `src/lib/grupos/apoioDoBanco.ts` | Conexão de teste, criação de usuário, "agir como" |
| `src/lib/grupos/funcoesSeguras.test.ts` | Guarda: toda função `security definer` escopa grupo ou está declarada |
| `src/lib/grupos/servicoComGrupo.test.ts` | Guarda: todo uso da chave de serviço está classificado |
| `.github/workflows/ci.yml` | Job novo `isolamento` |

---

### Task 1: Banco local reproduzível do zero

As 158 migrations nunca rodaram num banco vazio, e há objetos de produção
aplicados fora delas. Sem isso não existe onde testar isolamento.

**Files:**
- Create: `supabase/config.toml`, `supabase/REPRODUCAO.md`, `scripts/banco/dbTeste.mjs`
- Modify: `package.json` (scripts), migrations antigas só se não aplicarem
- Modify: `.gitignore` (`supabase/.temp`, `supabase/.branches`)

**Interfaces:**
- Produces: `npm run db:teste` sobe o banco e imprime
  `DB_TESTE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`;
  `npm run db:teste:parar` derruba. Fixe a versão do CLI no script
  (`npx supabase@<versão atual>`), nunca `latest`.

- [ ] **Step 1:** `npx supabase@<versão> init` só para gerar `config.toml`;
  `project_id = "next-home-teste"`. O CLI aceita o prefixo numérico `0001_`
  como versão; confirme rodando.
- [ ] **Step 2:** Rode `npm run db:teste`. Esperado na primeira vez: falha em
  alguma migration.
- [ ] **Step 3:** Para cada falha, conserte com a menor edição que deixa o
  estado final igual ao de produção (`if not exists`, extensão que faltava,
  objeto que só existia em produção). Nunca mude o efeito da migration.
  Registre cada edição em `supabase/REPRODUCAO.md`: arquivo, linha, erro,
  motivo. Repita até aplicar inteiro.
- [ ] **Step 4:** Conferência contra produção (**depende do Matheus**:
  precisa de um `SUPABASE_PAT` válido ou da URL do banco de produção). Gere
  a lista de tabelas, colunas, policies e funções nos dois bancos com a
  mesma consulta de `information_schema`/`pg_policies`/`pg_proc` e compare.
  Diferença vira linha em `REPRODUCAO.md` e uma migration de reconciliação
  `0159_*` antes das demais, renumerando as seguintes. Sem acesso, registre
  a conferência como pendente no topo do `REPRODUCAO.md` e siga.
- [ ] **Step 5:** `npm test` continua verde sem Docker. Commit:
  `git commit -m "Banco local reproduzível a partir das migrations"`.

---

### Task 2: Tabela `grupos` e o grupo da Next Home (0159)

**Files:**
- Create: `supabase/migrations/0159_grupos.sql`, `src/lib/grupos/grupo.ts`
- Modify: `src/lib/supabase/types.ts` (declarar `grupos` e `corretores.grupo_id` à mão; nunca regerar o arquivo inteiro)
- Test: `src/lib/grupos/isolamento.db.test.ts`, `src/lib/grupos/apoioDoBanco.ts`

**Interfaces:**
- Produces (SQL): tabela `public.grupos(id uuid pk default gen_random_uuid(),
  nome text not null, slug text not null unique, tipo text not null check
  (tipo in ('imobiliaria','independente')), criado_em timestamptz not null
  default now())`; linha do grupo 1 (Global Constraints);
  `corretores.grupo_id uuid not null references grupos(id)` com backfill no
  grupo 1; função `public.grupo_atual() returns uuid` — `language sql stable
  security definer set search_path = public`, `select grupo_id from corretores
  where user_id = (select auth.uid())`, no padrão de `corretor_atual()` da
  0007; grants: `revoke all on grupos from anon, authenticated`, `grant select
  on grupos to authenticated`, policy de select `id = (select
  public.grupo_atual())`.
- Produces (TS, `grupo.ts`): `export const GRUPO_NEXT_HOME_ID =
  "00000000-0000-0000-0000-000000000001"`; `export function grupoDoSite():
  string` que devolve `GRUPO_NEXT_HOME_ID` nesta fase (a fase 3 troca por
  resolução pelo `Host`; o comentário diz isso).
- Produces (teste, `apoioDoBanco.ts`): `conectar(): Sql` (pacote `postgres`
  como devDependency, lendo `DB_TESTE_URL`); `criarUsuario(sql, email):
  Promise<string>` inserindo em `auth.users` + `auth.identities` pelo molde
  descrito na MEMORIA ("Trocar o e-mail do Eduardo"); `comoUsuario<T>(sql,
  userId, fn): Promise<T>` que abre transação, faz `set local role
  authenticated` + `set local request.jwt.claims = '{"sub":"<id>",
  "role":"authenticated"}'`, roda `fn` e dá `rollback`; `criarGrupo(sql,
  {nome, slug}): Promise<{grupoId, gestorUserId, gestorId, corretorUserId,
  corretorId}>` usando a chave de serviço (`role postgres`).

- [ ] **Step 1: Teste que falha.** Em `isolamento.db.test.ts`
  (`describe.skipIf(!process.env.DB_TESTE_URL)`):
  - `"o grupo da Next Home existe com o id fixo"` → `select id, slug from
    grupos where id = GRUPO_NEXT_HOME_ID` devolve `next-home`.
  - `"todo corretor tem grupo"` → `select count(*) from corretores where
    grupo_id is null` = 0.
  - `"grupo_atual devolve o grupo de quem está logado"` → com
    `criarGrupo(sql, {slug:"b"})`, `comoUsuario(gestorUserId, "select
    grupo_atual()")` = `grupoId` de B.
  - `"usuário só enxerga o próprio grupo em grupos"` → como usuário de B,
    `select count(*) from grupos` = 1.
- [ ] **Step 2:** `npm run db:teste` e `DB_TESTE_URL=... npx vitest run
  src/lib/grupos/isolamento.db.test.ts`. Esperado: FAIL (`relation "grupos"
  does not exist`).
- [ ] **Step 3:** Escreva a 0159 e `grupo.ts` conforme Interfaces.
- [ ] **Step 4:** Recrie o banco local e rode o teste. Esperado: PASS.
  `npm test` (guardas `tabelasSeguras`, `migrations`) verde.
- [ ] **Step 5:** Commit `"0159: tabela grupos e o grupo da Next Home"`.

---

### Task 3: `grupo_id` em toda tabela de dados, preenchido por gatilho (0160)

**Files:**
- Create: `supabase/migrations/0160_grupo_em_todas_as_tabelas.sql`, `src/lib/grupos/tabelasDoGrupo.ts`
- Modify: `src/lib/supabase/types.ts` (`grupo_id: string` em Row; opcional em Insert)
- Test: `src/lib/grupos/isolamento.db.test.ts`

**Interfaces:**
- Consumes: `grupos`, `grupo_atual()` (Task 2).
- Produces (TS): `export const TABELAS_GLOBAIS: readonly string[]` — tabelas
  do `public` que **não** têm `grupo_id`, cada uma com o motivo em
  comentário. Ponto de partida: `grupos`, `parametros_credito` (parâmetros de
  crédito do país, iguais para todos). Toda outra tabela tem `grupo_id`.
- Produces (SQL): função `public.carimbar_grupo()` (trigger, plpgsql,
  `security definer`, `set search_path = public`) usada por todas as tabelas
  com o gatilho `before insert or update on <t> for each row execute function
  carimbar_grupo('<coluna_mae>', '<tabela_mae>')`, chamado `<t>_00_grupo`.
  Comportamento, nesta ordem:
  1. Em `UPDATE`, `new.grupo_id` diferente de `old.grupo_id` → erro, a menos
     que `current_setting('nexthome.transferindo_grupo', true) = 'on'` (a
     fase 5 liga isso dentro da função de saída do corretor).
  2. Se a coluna-mãe tem valor, o grupo da linha-mãe é o grupo da linha. Se
     `new.grupo_id` veio preenchido e diverge dele → erro
     `grupo da linha difere do grupo de <tabela_mae>`.
  3. Sem linha-mãe: `new.grupo_id`, senão `grupo_atual()`.
  4. Ainda nulo: se existe **exatamente um** grupo em `grupos`, usa esse com
     `raise warning 'grupo_id inferido pelo grupo único em %', tg_table_name`;
     senão erro `grupo_id obrigatório em <tabela>`. Isso deixa a produção de
     pé hoje e falha alto no dia em que existir o segundo grupo.
  A coluna-mãe de cada tabela segue esta regra, na ordem; use a primeira que
  a tabela tem: `lead_id` → `leads`; `conversa_id` → `whatsapp_conversas`;
  `venda_id` → `vendas`; `campanha_id` → `whatsapp_campanhas`;
  `instancia_id` → `corretor_whatsapp_instancias`; `corretor_id` →
  `corretores`; `empreendimento_id` → `empreendimentos`; nenhuma → sem
  linha-mãe. Confirme as colunas lendo a última definição de cada tabela nas
  migrations e liste a escolha num comentário no topo da 0160.
- Backfill: `update <t> set grupo_id = '<grupo 1>'` antes de `set not null`;
  `references grupos(id)`; índice `<t>_grupo_idx on <t>(grupo_id)`.
  `admin_eventos.grupo_id` fica **anulável** (nulo = evento da plataforma).
- A ordem de execução importa: coluna anulável → backfill → gatilho →
  `not null`. A 0160 inteira roda numa transação.

- [ ] **Step 1: Testes que falham** em `isolamento.db.test.ts`:
  - `"toda tabela do public tem grupo_id ou está em TABELAS_GLOBAIS"` →
    `information_schema` contra a constante; a mensagem lista as que faltam.
  - `"lead criado pelo corretor do grupo B nasce no grupo B"` → como
    corretor de B, insert em `leads` sem `grupo_id`; `grupo_id` = B.
  - `"mensagem herda o grupo da conversa"` → insert em `whatsapp_mensagens`
    só com `conversa_id` de uma conversa de B; `grupo_id` = B.
  - `"recusa grupo divergente da linha-mãe"` → insert com `lead_id` de A e
    `grupo_id` de B → erro contendo `difere do grupo`.
  - **Review Focus 2:** `"mudar o dono para alguém de outro grupo é recusado"`
    → `update leads set corretor_id = <corretor de A> where id = <lead de B>`
    pela role `postgres` → erro.
  - **Review Focus 1:** `"sem linha-mãe e com dois grupos, o insert falha"` →
    com A e B existindo, insert em `inbound_logs` pela role `postgres` sem
    `grupo_id` → erro `grupo_id obrigatório`.
  - `"com um grupo só, o insert sem grupo cai nele"` → banco recém-criado
    (só o grupo 1), mesmo insert → `grupo_id` = grupo 1.
- [ ] **Step 2:** Rode a suíte. Esperado: FAIL.
- [ ] **Step 3:** Escreva a 0160 e `tabelasDoGrupo.ts`.
- [ ] **Step 4:** Recrie o banco, rode a suíte e `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `"0160: grupo_id em toda tabela, derivado da linha-mãe"`.

---

### Task 4: Portas de entrada e chaves únicas escopadas

As linhas sem linha-mãe nascem nas portas de entrada; com um grupo só o
gatilho as resolve, mas com dois elas precisam dizer o grupo.

**Files:**
- Modify: cada insert pela chave de serviço numa tabela sem linha-mãe
  (achar com `grep` nos 70 arquivos que usam `createServiceClient`; ponto de
  partida: `src/app/api/leads/`, webhook da Meta, `src/lib/inbound/`,
  `src/app/wa/`, `src/lib/admin/` na criação de acesso, crons de métricas e
  outbox) — passar `grupo_id` explícito.
- Modify: as ações de criar acesso (`criarAcessoCorretor`,
  `criarAcessosQueFaltam`) gravam `corretores.grupo_id` = grupo do gestor
  logado.
- Create (se a regra abaixo exigir): `supabase/migrations/0161_funcoes_respeitam_grupo.sql` (a parte de chaves; Task 5 completa o arquivo)
- Test: `src/lib/grupos/isolamento.db.test.ts`

**Interfaces:**
- Consumes: `grupoDoSite()` (Task 2) nas portas públicas; o grupo do gestor
  vem de `corretores.grupo_id` do corretor logado.
- Regra das chaves únicas: liste todo índice/constraint `unique` do `public`.
  Chave de **conteúdo ou negócio** (ex.: `midias.hash_conteudo`) passa a
  incluir `grupo_id` ou uma coluna-mãe já escopada. `empreendimentos.slug` e
  `corretores.slug` **ficam globais** nesta fase (o site resolve por slug
  sem grupo até a fase 3); registre isso no comentário da migration.

- [ ] **Step 1: Teste que falha (Review Focus 5):** `"o mesmo arquivo pode
  existir em dois grupos"` → insert em `midias` com o mesmo `hash_conteudo`
  num imóvel de A e num de B → os dois entram. (Se o índice já é por imóvel,
  o teste passa de primeira; registre e siga.)
- [ ] **Step 2:** Rode. Esperado: FAIL se o índice é global.
- [ ] **Step 3:** Ajuste chaves e portas de entrada.
- [ ] **Step 4:** Suíte de isolamento + `npm test` + `npx tsc --noEmit`
  verdes.
- [ ] **Step 5:** Commit `"Portas de entrada e chaves únicas dizem o grupo"`.

---

### Task 5: Funções `security definer` respeitam o grupo (0161)

São 49 funções em 37 migrations; a RLS não vale dentro delas.

**Files:**
- Modify/Create: `supabase/migrations/0161_funcoes_respeitam_grupo.sql`
- Create: `src/lib/grupos/funcoesSeguras.test.ts`
- Test: `src/lib/grupos/isolamento.db.test.ts`

**Interfaces:**
- Consumes: `grupo_atual()`; em gatilho, `new.grupo_id`.
- Regra: toda função `security definer` que lê ou escreve linhas de outra
  pessoa restringe ao grupo — ao do usuário (`grupo_atual()`), ao da linha do
  gatilho (`new.grupo_id`) ou ao do parâmetro (ex.: o grupo do imóvel do
  porteiro). As que só tocam a linha do próprio chamador ou de um id já
  validado (cotas por instância, `corretor_atual()`) entram numa lista
  declarada na guarda, com o motivo.
- Obrigatórias (nomes conferidos nas migrations): `distribuir_lead` (roleta,
  0093 em diante), `sortear_corretor_whatsapp` (0130),
  `reivindicar_clique_do_link` (0143), `definir_papel_corretor` (0030), o
  gatilho `garantir_gestor_remanescente` (0030: "último gestor" passa a ser
  por grupo), a função de ranking da 0115 e toda função cujo corpo menciona
  `eh_gestor()`.
- `eh_gestor()` continua com o mesmo nome e significa "gestor do meu grupo":
  combinado com a policy restritiva da Task 6 isso basta nas policies; dentro
  de função `security definer`, o filtro de grupo é explícito.
- Guarda `funcoesSeguras.test.ts`: lê a **última** definição de cada função
  `security definer` nas migrations (padrão de `roletaDeLeads.test.ts`, que
  recorta por `create or replace function`, nunca por `function public.x(`) e
  reprova a que não menciona `grupo` nem está na lista declarada.

- [ ] **Step 1: Testes que falham:**
  - **Review Focus 3:** `"a roleta só escolhe corretor do grupo do lead"` →
    A com corretor conectado, B sem ninguém conectado; lead novo de B sem
    dono → `corretor_id` é corretor de B ou nulo, nunca de A.
  - `"o porteiro só sorteia corretor do grupo do imóvel"` → imóvel de B;
    `sortear_corretor_whatsapp(<imóvel de B>)` nunca devolve corretor de A.
  - **Review Focus 4:** `"gestor de B não muda o papel de corretor de A"` →
    como gestor de B, `definir_papel_corretor(<corretor de A>, 'gestor')` →
    erro; papel de A inalterado.
  - `"o último gestor é contado por grupo"` → A com um gestor; desativar o
    único gestor de A é recusado mesmo com gestores em B.
  - `"ranking só mostra o próprio grupo"` → venda em A; ranking chamado por B
    não traz o corretor de A.
  - Guarda `funcoesSeguras.test.ts` falhando com a lista das funções sem
    grupo.
- [ ] **Step 2:** Rode. Esperado: FAIL.
- [ ] **Step 3:** Escreva a 0161 (`create or replace` de cada função,
  preservando assinatura, `search_path` e grants; conferir `pg_proc` local
  por sobrecarga duplicada, como na 0117).
- [ ] **Step 4:** Suíte + `npm test` verdes. Provoque a guarda (tire o
  filtro de grupo de `distribuir_lead`), confira por md5 que a mordida mudou
  o arquivo, veja reprovar, desfaça.
- [ ] **Step 5:** Commit `"0161: funções security definer escopadas por grupo"`.

---

### Task 6: Isolamento por policy restritiva e no Storage (0162)

**Files:**
- Create: `supabase/migrations/0162_isolamento_por_grupo.sql`
- Test: `src/lib/grupos/isolamento.db.test.ts`

**Interfaces:**
- Produces (SQL): em toda tabela com `grupo_id`, `create policy
  isolamento_por_grupo on <t> as restrictive for all to authenticated using
  (grupo_id = (select public.grupo_atual())) with check (grupo_id = (select
  public.grupo_atual()))`. Em `admin_eventos`, a linha de grupo nulo não é
  visível ao `authenticated`. Policies `to anon` ficam como estão nesta fase.
- Storage: as policies de `storage.objects` para `authenticated` que usam o
  caminho `corretores/<id>/…` e `empreendimentos/<id>/…` passam a exigir que
  o corretor/imóvel do caminho seja do `grupo_atual()`. Leitura pública do
  bucket não muda.

- [ ] **Step 1: Testes que falham** (dados de A e B criados pela role
  `postgres`: um lead, uma conversa com mensagem, um imóvel com mídia, uma
  venda, uma anotação, uma interação da IA em cada grupo):
  - `"nenhuma tabela mostra linha de outro grupo"` → como gestor de B, para
    cada tabela com `grupo_id`, `select count(*) from <t> where grupo_id <>
    <B>` = 0. Laço sobre `information_schema`, mensagem com a tabela.
  - `"não escreve em linha de outro grupo"` → como gestor de B, `update
    leads set nome = 'x' where id = <lead de A>` afeta 0 linhas; insert com
    `grupo_id` = A é recusado.
  - `"views respeitam o grupo"` → como gestor de B, cada view do `public`
    devolve só linhas de B (laço sobre `pg_views`).
  - `"não grava no Storage de outro grupo"` → como corretor de B, insert em
    `storage.objects` no caminho `empreendimentos/<imóvel de A>/x.jpg` →
    recusado.
  - `"a Next Home continua vendo o que via"` → como gestor do grupo 1, as
    contagens de `leads`, `whatsapp_conversas` e `empreendimentos` são as
    mesmas de antes da 0162.
- [ ] **Step 2:** Rode. Esperado: FAIL.
- [ ] **Step 3:** Escreva a 0162.
- [ ] **Step 4:** Suíte + `npm test` verdes. Provoque: remova a policy
  restritiva de `leads` no banco local e veja o primeiro teste reprovar.
- [ ] **Step 5:** Commit `"0162: isolamento por grupo em policy restritiva"`.

---

### Task 7: Chave de serviço classificada

A chave de serviço ignora a RLS. São ~70 arquivos.

**Files:**
- Create: `src/lib/grupos/servicoComGrupo.test.ts`
- Modify: os arquivos da categoria `equipe` que ainda não filtram grupo (ponto de partida: `clienteParaNumerosDaEquipe` e quem o usa)

**Interfaces:**
- A guarda tem um mapa declarado `arquivo → categoria` para todo arquivo
  que importa `createServiceClient` ou `clienteParaNumerosDaEquipe`:
  - `por-id`: age numa linha alcançada por id de fonte confiável (instância
    do webhook, token, id validado pela sessão);
  - `equipe`: lê várias pessoas para mostrar ao usuário — o arquivo precisa
    conter `grupo_id`;
  - `plataforma`: cron que percorre todos os grupos de propósito, agindo
    linha a linha.
  Arquivo novo fora do mapa reprova, com a mensagem pedindo a categoria.

- [ ] **Step 1:** Escreva a guarda com o mapa vazio. Esperado: FAIL listando
  os arquivos.
- [ ] **Step 2:** Classifique cada arquivo lendo o uso. Nos `equipe`, filtre
  pelo grupo do usuário da sessão.
- [ ] **Step 3:** `npm test` + `npx tsc --noEmit` verdes. Provoque: tire o
  filtro de um `equipe`, veja reprovar, desfaça.
- [ ] **Step 4:** Commit `"Uso da chave de serviço classificado por grupo"`.

---

### Task 8: Suíte de isolamento no CI

**Files:**
- Modify: `.github/workflows/ci.yml` (job novo `isolamento`), `package.json` (`test:isolamento`)

- [ ] **Step 1:** Job `isolamento` em `ubuntu-latest`: `npm ci`, `npm run
  db:teste`, `DB_TESTE_URL=... npm run test:isolamento`, `npm run
  db:teste:parar` em `if: always()`. `timeout-minutes: 20`. Comentário no
  topo no estilo do arquivo explicando por que existe.
- [ ] **Step 2:** Push na branch de trabalho e confira o job verde no GitHub.
  Provoque uma vez com um commit temporário que remove a policy restritiva
  de `leads`; o job tem de ficar vermelho; reverta.
- [ ] **Step 3:** Commit `"CI roda a suíte de isolamento contra banco local"`.

---

### Task 9: Produção, na ordem que não derruba nada

Quem aplica em produção é o Matheus (o conector desta sessão não tem
permissão). O executor entrega o roteiro em
`docs/ROTEIRO-FASE-1-PRODUCAO.md` e só segue quando ele confirmar cada passo.

**Files:**
- Create: `docs/ROTEIRO-FASE-1-PRODUCAO.md`
- Modify: `docs/MEMORIA.md`, `vault/10-notas/plataforma-multi-grupo.md`, MOC de Banco de Dados

Ordem, cada passo verificável:
1. Aplicar 0159 e 0160. Conferir: `select count(*) from <t> where grupo_id
   is null` = 0 em toda tabela; o site e o painel abrem; uma mensagem de
   teste no WhatsApp da Bruna é respondida; logs do Postgres mostram o
   `warning` de grupo único só nas tabelas sem linha-mãe.
2. Deploy do código das Tasks 4 e 7 nas duas branches de produção
   (MEMORIA: conferir qual commit está servindo antes e depois).
3. Aplicar 0161. Conferir: lead novo pelo formulário público cai na roleta
   como antes; `/wa/<imóvel>` sorteia como antes.
4. Aplicar 0162. Conferir: como gestor da Next Home, contagens de leads,
   conversas e imóveis iguais às de antes do passo 1; corretor comum vê só o
   que via; upload de foto funciona.
5. Rodar `get_advisors` de segurança: nada novo.

- [ ] **Step 1:** Escreva o roteiro com as consultas exatas de cada
  conferência e o desfazer de cada passo (as policies e gatilhos caem com
  `drop`; colunas ficam).
- [ ] **Step 2:** Acompanhe o Matheus passo a passo.
- [ ] **Step 3:** Vault e MEMORIA: o que custou tempo na fase (edições em
  `REPRODUCAO.md`, funções que vazavam, surpresas da produção). Commit.

---

## Fora desta fase (não fazer aqui)

- Leitura pública fora da chave `anon`, cache e site por grupo → fase 3.
- Painel da plataforma, criação de grupo pela tela, medidor → fase 2.
- `empreendimentos.slug` por grupo → fase 3.
- Função de saída do corretor (`nexthome.transferindo_grupo`) → fase 5.
