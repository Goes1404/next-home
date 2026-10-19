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
- Migrations novas numeradas a partir de `0181` (a produção ocupou 0159–0180 entre 06 e 17/10; a branch trouxe esse trabalho no merge `d86165f`), conferindo contra
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

Acrescentadas na revisão de lacunas (19/10):

- **Grupo 1 é o único com integrações** até a fase 7: Meta Ads, Gmail e Pixel
  valem só para `GRUPO_NEXT_HOME_ID`. (L19)
- **Script ou migration de dados que escreve em tabela com `grupo_id` nomeia o
  grupo.** Scripts com `SUPABASE_SECRET_KEY` exigem `--grupo=<id>` e, nesta
  fase, só aceitam o grupo 1. (L22)
- **Log não leva conteúdo de conversa, de e-mail nem telefone completo.** (L22)
- **Co-corretagem entre grupos é recusada NA FASE 1.** O dono decidiu (19/10)
  que ela vai existir, com convite aceito e exceção auditada — isso é obra de
  fase posterior (§19 do desenho). Até lá o gatilho recusa participante de
  outro grupo. (L03)

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


Acrescentados na revisão de lacunas (19/10):

6. **Gatilho que grava em outra tabela** (outbox, campanha canônica da Meta)
   com dois grupos e chave de serviço: o lead nasce e a linha filha cai no
   grupo dele. → Task 3.
7. **FK secundária para outro grupo** (destinatário da anotação, participante
   da venda, imóvel do lead): recusada. → Task 3.
8. **Porta de entrada que LÊ** (e-mail de portal, Lead Ads, palavra-chave,
   `/wa`, parceiro, aviso de novidade) não enxerga nem altera dado de outro
   grupo. → Task 4b.
9. **Função `security definer` com id no parâmetro** chamada pela API por
   usuário logado de outro grupo. → Task 5.

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/config.toml` | Projeto local do Supabase CLI |
| `supabase/REPRODUCAO.md` | Toda edição feita em migration antiga para ela aplicar do zero, com o motivo |
| `scripts/banco/dbTeste.mjs` | Sobe o banco local, aplica as migrations e imprime `DB_TESTE_URL` |
| `supabase/migrations/0181_grupos.sql` | Tabela `grupos`, grupo 1, `corretores.grupo_id`, `grupo_atual()` |
| `supabase/migrations/0182_grupo_em_todas_as_tabelas.sql` | `grupo_id` + backfill + índice + gatilho `<tabela>_00_grupo` |
| `supabase/migrations/0183_funcoes_respeitam_grupo.sql` | Funções `security definer` e chaves únicas escopadas por grupo |
| `supabase/migrations/0184_isolamento_por_grupo.sql` | Policies restritivas e policies de Storage |
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
  `0181_*` antes das demais, renumerando as seguintes. Sem acesso, registre
  a conferência como pendente no topo do `REPRODUCAO.md` e siga.
- [ ] **Step 5:** `npm test` continua verde sem Docker. Commit:
  `git commit -m "Banco local reproduzível a partir das migrations"`.

---

### Task 2: Tabela `grupos` e o grupo da Next Home (0181)

**Files:**
- Create: `supabase/migrations/0181_grupos.sql`, `src/lib/grupos/grupo.ts`
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
- [ ] **Step 3:** Escreva a 0181 e `grupo.ts` conforme Interfaces.
- [ ] **Step 4:** Recrie o banco local e rode o teste. Esperado: PASS.
  `npm test` (guardas `tabelasSeguras`, `migrations`) verde.
- [ ] **Step 5:** Commit `"0181: tabela grupos e o grupo da Next Home"`.

---

### Task 3: `grupo_id` em toda tabela de dados, preenchido por gatilho (0182)

**Files:**
- Create: `supabase/migrations/0182_grupo_em_todas_as_tabelas.sql`, `src/lib/grupos/tabelasDoGrupo.ts`
- Modify: `src/lib/supabase/types.ts` (`grupo_id: string` em Row; opcional em Insert)
- Test: `src/lib/grupos/isolamento.db.test.ts`

**Interfaces:**
- Consumes: `grupos`, `grupo_atual()` (Task 2).
- Produces (TS): `export const TABELAS_GLOBAIS: readonly string[]` — tabelas
  do `public` que **não** têm `grupo_id`, cada uma com o motivo em
  comentário. Ponto de partida: `grupos`. Toda outra tabela tem `grupo_id`,
  inclusive `parametros_credito` (decisão de 19/10: cada imobiliária ajusta as
  próprias taxas; a linha existente vira a do grupo 1).
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
  migrations e liste a escolha num comentário no topo da 0182.
- Backfill: `update <t> set grupo_id = '<grupo 1>'` antes de `set not null`;
  `references grupos(id)`; índice `<t>_grupo_idx on <t>(grupo_id)`.
  `admin_eventos.grupo_id` fica **anulável** (nulo = evento da plataforma).
- A ordem de execução importa: coluna anulável → backfill → gatilho →
  `not null`. A 0182 inteira roda numa transação.

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
- [ ] **Step 3:** Escreva a 0182 e `tabelasDoGrupo.ts`.
- [ ] **Step 4:** Recrie o banco, rode a suíte e `npm test`. Esperado: PASS.
- [ ] **Step 5:** Commit `"0182: grupo_id em toda tabela, derivado da linha-mãe"`.

#### Acréscimos da revisão de lacunas (19/10)

**Files (somar):**
- Modify: `supabase/migrations/0182_grupo_em_todas_as_tabelas.sql`
- Modify: `src/lib/grupos/tabelasDoGrupo.ts`

**Interfaces (substitui a regra de coluna-mãe):**
- **Mapa por FK, não por nome.** A 0182 gera, num bloco `do`, a lista
  `(tabela, coluna, tabela_mãe)` de toda FK de uma tabela com `grupo_id` para
  outra tabela com `grupo_id` (`pg_constraint`, `contype = 'f'`), e o gatilho
  recebe as colunas dessa lista. Colunas sem FK que guardam id (ex.:
  `ia_interacoes.corretor_id`, com ids de corretores apagados) ficam numa lista
  declarada no topo da migration, com o motivo, e não contam como mãe. (L02)
- **`carimbar_grupo` confere TODAS as colunas-mãe.** Regra 2 nova: para cada
  coluna-mãe com valor, se a linha-mãe não existe → erro
  `linha-mãe inexistente em <tabela>.<coluna>`; se existe e o grupo diverge do
  das outras mães ou de `new.grupo_id` → erro `grupo da linha difere do grupo
  de <tabela_mãe>`. No `UPDATE`, só as colunas cujo valor mudou
  (`new.col is distinct from old.col`). (L03)
- **Regra 1 nova:** troca de `grupo_id` só quando `current_user =
  'transferidor_de_grupo'` (role `NOLOGIN`, criada na 0182 sem membros; a
  fase 5 faz a função de saída pertencer a ela). Sai a variável
  `nexthome.transferindo_grupo`. (L04)
- **`admin_eventos`:** mães em ordem `alvo_corretor_id`, `ator_id`; nulo só se
  a função grava `grupo_id = null` explicitamente e o chamador é
  `eh_admin_da_plataforma()` ou a chave de serviço com a marca
  `origem = 'plataforma'` em `detalhes`. (L02)
- **Gatilhos internos repassam o grupo:** a 0182 recria
  `registrar_evento_lead_criado` e `vincular_campanha_meta_canonica` (0065)
  gravando `grupo_id = new.grupo_id` nas linhas filhas, e renomeia o gatilho
  `meta_ads_campanha_canonica` para `meta_ads_metricas_10_campanha` (ordena
  depois de `_00_grupo`). A 0182 também lista todo gatilho `before` cujo nome
  ordena antes de `<t>_00_grupo` e lê `grupo_id` (consulta em `pg_trigger`),
  falhando se achar algum. (L01)
- **`TABELAS_GLOBAIS` ganha:** `whatsapp_disparo_lock` (trava de
  infraestrutura), `whatsapp_diagnosticos` (diagnóstico do provedor, por
  `instance_name`), `administradores_da_plataforma`. Nenhuma delas tem select
  para `authenticated`. (L05)
- **`catalogo_candidatos`:** ganha `grupo_id` (backfill no grupo 1, sem mãe →
  `grupo_atual()` ou explícito); `unique (fonte, ref_externa)` vira
  `unique (grupo_id, fonte, ref_externa)`. (L28)

**Passos (somar ao Step 1, testes que falham):**
- **Review Focus 6:** `"lead inserido pela chave de serviço com dois grupos
  gera evento no grupo dele"` → A e B existindo; como `postgres`, insert em
  `leads` com `corretor_id` de B; o lead nasce e as linhas novas de
  `marketing_eventos` e `event_outbox` têm `grupo_id` = B.
- `"métrica da Meta com grupo explícito cria campanha canônica no mesmo grupo"`
  → insert em `meta_ads_metricas` com `grupo_id` = B; a linha de
  `marketing_campanhas` tem `grupo_id` = B.
- `"mensagem do estúdio herda o grupo da conversa do estúdio"` → insert em
  `estudio_mensagens` com `conversa_id` de uma `estudio_conversas` de B;
  `grupo_id` = B (prova que o mapa não usa `whatsapp_conversas`).
- **Review Focus 7:** `"FK secundária de outro grupo é recusada"` → insert em
  `anotacoes` com `corretor_id` de B e `destinatario_id` de A → erro; insert em
  `venda_participantes` de venda de B com `corretor_id` de A → erro; update de
  lead de B com `empreendimento_id` de A → erro.
- `"UPDATE que não mexe na mãe não reconfere"` → venda de B com `lead_id`; como
  `transferidor_de_grupo`, muda o grupo do lead para A; update de `status` da
  venda passa.
- `"ninguém troca grupo por variável de sessão"` → como `postgres`,
  `set_config('nexthome.transferindo_grupo','on',true)` e update de
  `grupo_id` → erro.
- `"trava de disparo funciona com dois grupos"` → `select travar_disparo(...)`
  pela role `postgres` com A e B existindo → `true`, sem erro.
- `"linha-mãe inexistente é recusada"` → insert em `whatsapp_mensagens` com
  `conversa_id` aleatório → erro contendo `linha-mãe inexistente`.

**Step 4 (somar):** provocar a conferência de todas as mães (voltar a conferir
só a primeira) e ver o teste de `anotacoes` reprovar; mordida conferida por
md5.

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
- Create (se a regra abaixo exigir): `supabase/migrations/0183_funcoes_respeitam_grupo.sql` (a parte de chaves; Task 5 completa o arquivo)
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

#### Acréscimos da revisão de lacunas (19/10)

**Files (somar):**
- Modify: `src/app/corretor/(painel)/admin/acoes.ts` (`slugDisponivel`, e-mails
  ocupados), `src/app/corretor/actions.ts` (`atribuirLead`),
  `src/app/corretor/(painel)/admin/acoes.ts` (`redistribuirCarteira`)
- Modify: `supabase/migrations/0183_funcoes_respeitam_grupo.sql`
- Modify: `src/lib/whatsapp/telemetria.ts`, `src/lib/whatsapp/repositorio.ts` (`gravarMensagem`)
- Modify: scripts de catálogo e o `scripts/lancamentosBarueri.mjs` (`--grupo`)

**Interfaces (somar):**
- Função `public.slug_de_corretor_livre(p_slug text) returns boolean` e
  `public.email_de_acesso_livre(p_email text) returns boolean`, ambas
  `security definer`, que olham todos os grupos e devolvem só sim/não;
  `grant execute` só a `authenticated` com `eh_gestor()` conferido no corpo.
  As ações de criar acesso passam a usá-las no lugar das leituras pela sessão.
  (L27)
- Antes de sobrescrever `origem_atribuicao`, `atribuirLead` e
  `redistribuirCarteira` inserem em `lead_interacoes` (`tipo = 'repasse'`,
  `detalhes.origem_anterior`). (L30)
- `registrarInteracao` e `gravarMensagem` leem o `{ error }`; erro que não é
  `23505` loga e devolve falha (`gravarMensagem` devolve
  `{ inedita: false, erro }`, e o webhook não responde ao cliente por cima de
  uma mensagem não gravada). (L26)

**Passos (somar):**
- Teste (vitest, sem banco): `"gravarMensagem não diz inédita quando o insert
  falha"` com cliente falso devolvendo `{ error: { code: '23503' } }`.
- Teste de banco: `"slug do outro grupo aparece como ocupado"` → slug usado em
  A; como gestor de B, `slug_de_corretor_livre(<slug>)` = `false`.

---

### Task 5: Funções `security definer` respeitam o grupo (0183)

São 49 funções em 37 migrations; a RLS não vale dentro delas.

**Files:**
- Modify/Create: `supabase/migrations/0183_funcoes_respeitam_grupo.sql`
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
- [ ] **Step 3:** Escreva a 0183 (`create or replace` de cada função,
  preservando assinatura, `search_path` e grants; conferir `pg_proc` local
  por sobrecarga duplicada, como na 0117).
- [ ] **Step 4:** Suíte + `npm test` verdes. Provoque a guarda (tire o
  filtro de grupo de `distribuir_lead`), confira por md5 que a mordida mudou
  o arquivo, veja reprovar, desfaça.
- [ ] **Step 5:** Commit `"0183: funções security definer escopadas por grupo"`.

#### Acréscimos da revisão de lacunas (19/10)

**Interfaces (somar):**
- **EXECUTE também conta.** Toda função `security definer` que recebe id de
  corretor, instância ou lead no parâmetro, ou é revogada de `authenticated`
  (só chave de serviço e cron chamam), ou confere que o id é do chamador. Ponto
  de partida: `reservar_credito_video`, `devolver_credito_video` (0092): saem
  do `authenticated`. (L20)
- `salvar_venda` (0114) recusa participante de outro grupo (já coberto pelo
  gatilho da Task 3, mas a função devolve mensagem legível). (L03)
- A guarda `funcoesSeguras` ganha uma metade de banco
  (`funcoesSeguras.db.test.ts`): lê `pg_proc` com `prosecdef` no banco local,
  cruza com a lista declarada e com `has_function_privilege('authenticated',
  oid, 'execute')`. Função que existe só no texto (apagada) não é cobrada;
  função que existe só no banco reprova. (L21)

**Passos (somar ao Step 1):**
- **Review Focus 9:** `"usuário logado não reserva crédito de vídeo de outro"`
  → como corretor de B, `select reservar_credito_video(<corretor de A>)` →
  `permission denied`.
- `"toda função security definer está no banco e na lista"` (metade de banco
  da guarda).

---

### Task 6: Isolamento por policy restritiva e no Storage (0184)

**Files:**
- Create: `supabase/migrations/0184_isolamento_por_grupo.sql`
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
    mesmas de antes da 0184.
- [ ] **Step 2:** Rode. Esperado: FAIL.
- [ ] **Step 3:** Escreva a 0184.
- [ ] **Step 4:** Suíte + `npm test` verdes. Provoque: remova a policy
  restritiva de `leads` no banco local e veja o primeiro teste reprovar.
- [ ] **Step 5:** Commit `"0184: isolamento por grupo em policy restritiva"`.

#### Acréscimos da revisão de lacunas (19/10)

**Files (somar):**
- Modify: `supabase/migrations/0184_isolamento_por_grupo.sql` (views)
- Modify: `scripts/banco/dbTeste.mjs` (tira `realtime` da lista `FORA`)
- Modify: `src/lib/supabase/types.ts` (`grupo_id` nas views)
- Test: `src/lib/grupos/realtime.db.test.ts`

**Interfaces (somar):**
- Toda view do `public` é recriada com `grupo_id` na lista de colunas
  (`pessoas_do_corretor`, `whatsapp_funil_metricas`,
  `whatsapp_resposta_metricas`, `whatsapp_esperando_resposta`,
  `whatsapp_primeira_resposta`, `sla_leads_metricas` e as que o laço achar),
  mantendo `security_invoker = on` e o `revoke` do `anon`; `drop` + `create`
  quando a coluna entra no meio (MEMORIA 0072). (L17)
- O teste `"views respeitam o grupo"` passa a contar `where grupo_id <> <B>`
  em cada view; view sem `grupo_id` reprova com o nome.

**Passos (somar):**
- `"realtime não entrega mudança de outro grupo"` → como corretor de B,
  assinar `postgres_changes` em `whatsapp_mensagens`; inserir mensagem numa
  conversa de A pela role `postgres`; em 3 s nenhum evento chega; inserir numa
  de B; o evento chega (prova que a assinatura funciona). (L25)

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

#### Acréscimos da revisão de lacunas (19/10)

**Files (somar):**
- Modify: `src/app/corretor/(painel)/admin/whatsapp/acoes.ts`
  (`desconectarNumeroDoCorretor`), `src/app/corretor/(painel)/admin/parceiros/acoes.ts`
  (`trocarLinkDoParceiro`), `src/app/api/imagens/gerar/route.ts` (`midiaId`)
- Modify: `src/app/corretor/(painel)/admin/page.tsx`,
  `src/app/corretor/(painel)/admin/whatsapp/page.tsx`,
  `src/lib/financeiro/dados.ts`,
  `src/app/corretor/(painel)/admin/_componentes/ProntidaoDaEquipe.tsx`,
  `src/lib/admin/numerosDaEquipe.ts`
- Modify: `src/lib/admin/numerosDaSemana.ts`,
  `src/app/api/cron/relatorio-semanal/route.ts`,
  `src/app/api/cron/quem-esta-esperando/route.ts`
- Modify: `scripts/observatorio.ts`, `scripts/observatorioConsultor.ts`,
  `scripts/eval/exportarGolden.ts`, `scripts/eval/casosDoConsultor.ts`,
  `scripts/catalogo/*.ts`, `scripts/migrar.ts`, `scripts/*.sql` de diagnóstico
- Modify: `src/lib/whatsapp/audioTranscriber.ts`, `src/lib/inbound/processarEmail.ts` (logs)

**Interfaces (substitui as categorias):**
- `por-id`: o mapa declara também a função que validou o id
  (`{ arquivo, categoria: 'por-id', validadoPor: '<nome>' }`) e a guarda exige
  que esse nome apareça no arquivo antes do primeiro `createServiceClient()`.
  Os três arquivos acima passam a ler o alvo pela sessão (ou conferir
  `grupo_id` igual ao da sessão) antes de agir. (L16)
- `equipe`: cada `.from(` de leitura no arquivo precisa de `grupo_id` no mesmo
  encadeamento (não basta o arquivo conter a palavra). `clienteParaNumerosDaEquipe()`
  passa a exigir `grupoId` e devolve um objeto que só expõe consultas já
  filtradas. (L16, L17)
- `agrega-por-grupo` (novo): cron que soma números; exige laço por grupo e
  destinatários do mesmo grupo. Relatório semanal e aviso de espera entram aqui.
  (L18)
- `cruza-conjuntos` (novo): cron que junta duas listas (ex.: aviso de
  novidade); exige igualdade de `grupo_id` entre os dois lados. (L13)
- `plataforma`: só o que age linha a linha sem juntar nem somar.
- A guarda passa a varrer também `scripts/` procurando `SUPABASE_SECRET_KEY`
  ou `createClient(` com chave secreta; todo script assim exige `--grupo` e
  recusa grupo diferente do 1. (L22)

**Passos (somar):**
- [ ] Teste (vitest): `"desconectarNumeroDoCorretor recusa corretor de outro
  grupo"` com sessão falsa do grupo B e alvo do grupo A.
- [ ] Teste (vitest): `"/api/imagens/gerar não usa mídia de outro grupo"`.
- [ ] Teste (vitest): `"relatório semanal manda a cada gestor só os números do
  grupo dele"`.
- [ ] Teste (vitest): `"script sem --grupo recusa rodar"` para
  `observatorio.ts` e `exportarGolden.ts`.
- [ ] Logs: tirar o trecho de transcrição de `audioTranscriber.ts:308` e o
  telefone/payload dos logs de `processarEmail.ts`; teste de guarda que reprova
  `console.*` com `conteudo`, `transcricao` ou `telefone` nesses arquivos.
- [ ] Provocar cada categoria nova uma vez (md5 antes/depois).

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
1. Aplicar 0181 e 0182. Conferir: `select count(*) from <t> where grupo_id
   is null` = 0 em toda tabela; o site e o painel abrem; uma mensagem de
   teste no WhatsApp da Bruna é respondida; logs do Postgres mostram o
   `warning` de grupo único só nas tabelas sem linha-mãe.
2. Deploy do código das Tasks 4 e 7 nas duas branches de produção
   (MEMORIA: conferir qual commit está servindo antes e depois).
3. Aplicar 0183. Conferir: lead novo pelo formulário público cai na roleta
   como antes; `/wa/<imóvel>` sorteia como antes.
4. Aplicar 0184. Conferir: como gestor da Next Home, contagens de leads,
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

#### Acréscimos da revisão de lacunas (19/10)

- Passo 2 inclui o código das Tasks 4b e 7 (portas que leem, telas do gestor,
  scripts). Ele funciona com um grupo só, então sobe antes da 0183.
- Depois do passo 1, conferir: `select count(*) from event_outbox where
  grupo_id is null` = 0; um lead pelo formulário público gera evento.
- Depois do passo 3, conferir: `/wa` (sem imóvel) sorteia como antes;
  `has_function_privilege('authenticated', 'public.reservar_credito_video(uuid)',
  'execute')` = `false`.
- Depois do passo 4, conferir: Visão geral do gestor mostra os mesmos números
  de antes; o Live Chat recebe mensagem nova em tempo real.
- Antes de qualquer grupo além do 1 existir em produção (fase 2): a suíte de
  isolamento e o E2E do ambiente de testes verdes no mesmo commit.

---

### Task 11: Acréscimos à tabela grupos (executa logo depois da Task 2)

A Task 2 começou antes da revisão de lacunas; isto é o que a revisão acrescentou a ela.
Os acréscimos entram na própria `0181_grupos.sql`, que ainda não foi aplicada em produção. `src/lib/grupos/tabelasDoGrupo.ts` é criado aqui (a Task 3 o completa) com `TABELAS_GLOBAIS` contendo `grupos` e `administradores_da_plataforma`.

**Files (somar):**
- Modify: `src/lib/corretorSessao.ts` (`grupoId` na sessão; recusa inativo)
- Modify: `supabase/migrations/0181_grupos.sql`
- Modify: `src/lib/grupos/tabelasDoGrupo.ts` (entra `administradores_da_plataforma`)
- Modify: `src/app/corretor/(painel)/admin/credito/*` e `src/lib/credito/parametros.ts` (taxas por grupo: a tela edita as do próprio grupo; a chave do `unstable_cache` leva o grupo)

**Interfaces (somar):**
- `grupo_atual()`, e a nova definição de `corretor_atual()` e `eh_gestor()`
  na mesma migration, passam a filtrar `ativo`: `... where user_id = (select
  auth.uid()) and ativo`. Corretor inativo devolve nulo. (L07)
- Tabela `public.administradores_da_plataforma(user_id uuid primary key
  references auth.users(id), criado_em timestamptz not null default now())`;
  `revoke all from anon, authenticated`; nenhum grant (só a chave de serviço e
  funções `security definer` leem). Função `public.eh_admin_da_plataforma()
  returns boolean` (`stable security definer set search_path = public`). (L06)
- **Taxas de crédito por grupo** (decisão de 19/10, substitui a L06):
  `parametros_credito` ganha `grupo_id` (a linha existente vai para o grupo
  1; a unicidade, se houver, vira por grupo). `atualizar_parametros_credito`
  (0103) só altera a linha do `grupo_atual()` e exige gestor ativo DESSE
  grupo. A leitura do painel e do consultor usa as taxas do grupo do usuário;
  a leitura pública (`/financiamento`, `anon`, 0107) usa as do grupo 1 nesta
  fase, via `grupoDoSite()`. Grupo novo nasce com cópia das taxas do grupo 1
  (fase 2).
- `getCorretorLogado()` devolve `grupoId: string`; corretor inativo cai na tela
  de conta sem vínculo. (L29, L07)

**Passos (somar ao Step 1, testes que falham):**
- `"corretor desativado perde o grupo"` → `update corretores set ativo = false`
  no gestor de B; `comoUsuario(gestorUserId, "select grupo_atual(),
  eh_gestor()")` = `(null, false)`.
- `"gestor muda só as taxas do próprio grupo"` → como gestor de B,
  `atualizar_parametros_credito(...)` altera a linha de B e a linha do grupo
  1 fica igual; corretor (não gestor) de B → erro.

---

### Task 12: Portas de entrada que LEEM ficam dentro do grupo (executa depois da Task 4)

As Tasks 4 e 7 cuidam do que é gravado. Estas portas consultam o banco antes de
gravar, e a consulta atravessa grupos.

**Files:**
- Modify: `src/lib/inbound/processarEmail.ts`, `src/lib/inbound/gmailCaixa.ts`
- Modify: `src/app/api/webhooks/meta/route.ts`, `src/lib/metaAds.ts`, `src/app/api/cron/meta-ads/route.ts`
- Modify: `src/lib/whatsapp/repositorio.ts` (`cadastrarPelaPalavraChave`, `registrarAtivacaoEmLeadAlheio`)
- Modify: `src/app/wa/route.ts`, `src/app/wa/[campanha]/route.ts`
- Modify: `src/app/(institucional)/parceiro/[token]/page.tsx`, `.../acoes.ts`, `src/app/corretor/(painel)/admin/parceiros/acoes.ts`
- Modify: `src/lib/crm/avisoDeNovidade.ts`
- Modify: `src/app/api/leads/route.ts`, `src/app/api/clique-whatsapp/route.ts`
- Modify: `src/lib/catalogo/cache.ts`, `src/lib/queries.ts`
- Modify: `src/app/corretor/(painel)/admin/anuncios/*`, `src/app/api/gmail/conectar/route.ts`
- Create: `src/lib/grupos/integracoes.ts`
- Modify: `supabase/migrations/0182_*` (`parceiros.grupo_id`, mãe `parceiro_id`) e `0183_*` (`sortear_corretor_whatsapp(p_grupo, …)`)
- Test: `src/lib/grupos/isolamento.db.test.ts`, `src/lib/grupos/portas.test.ts`

**Interfaces:**
- Consumes: `grupoDoSite()`, `GRUPO_NEXT_HOME_ID`, `getCorretorLogado().grupoId`.
- Produces: `export function integracaoLiberada(grupoId: string, qual:
  'meta' | 'gmail' | 'pixel'): boolean` — `true` só para o grupo 1 nesta fase
  (L19). Telas de Meta e o `conectar` do Gmail chamam isso; `metaAds.ts` grava
  `grupo_id = GRUPO_NEXT_HOME_ID`.
- `processarEmailDeLead(..., { grupoId })`: obrigatório; imóveis, corretor
  mencionado (só do grupo, e nunca vence o dono da caixa de outro grupo),
  dedupe por telefone e por `email_message_id` filtrados por ele. O webhook de
  portal usa o grupo 1; o Gmail usa o grupo do dono da caixa. (L08)
- Webhook de Lead Ads: dedupe e update da ficha só dentro do grupo 1. (L09)
- `cadastrarPelaPalavraChave`: a busca de lead "alheio" filtra o grupo da
  instância; fora dele o número é tratado como novo. (L10)
- `sortear_corretor_whatsapp(p_grupo uuid, p_empreendimento uuid default null,
  preferido uuid default null)`: sorteia só no grupo; `preferido` de outro grupo
  é ignorado; o imóvel, se vier, tem de ser do grupo. As rotas `/wa` passam
  `grupoDoSite()`, e `/wa/<campanha>` resolve a campanha só nos imóveis do
  grupo. O fallback sem argumento sai. (L11)
- `parceiros.grupo_id`: a página lista só imóveis do grupo do parceiro; a
  indicação recusa imóvel de outro grupo e grava o lead com
  `parceiro_id` como mãe. (L12)
- `avisarQuemPediuAlerta`: casa imóvel e lead só quando `imovel.grupo_id =
  lead.grupo_id`. (L13)
- `/api/leads` e `/api/clique-whatsapp` gravam pela chave de serviço com
  `grupo_id = grupoDoSite()`; `corretorId` e `empreendimentoId` do corpo só são
  aceitos se forem do grupo; se não, gravam sem eles. (L14)
- `catalogoPublicado`, `corretoresPublicos` e `getEmpreendimentos` filtram
  `grupo_id = grupoDoSite()`; o webhook e os crons passam o grupo da instância
  a `getEmpreendimentos(grupoId)`. A chave do `unstable_cache` leva o grupo.
  (L15)

**Passos:**
- [ ] **Step 1: Testes que falham.**
  - Banco: `"o porteiro sem imóvel só sorteia no grupo pedido"` → A com
    corretor conectado, B sem ninguém; `sortear_corretor_whatsapp(<B>)` = nulo.
  - Banco: `"preferido de outro grupo não ganha a vez"` → `sortear(<B>,
    null, <corretor de A>)` nunca devolve o corretor de A.
  - Banco: `"indicação do parceiro de A para imóvel de B é recusada"`.
  - Vitest (cliente falso que registra os filtros): `"processarEmailDeLead
    filtra imóveis, corretores e dedupe pelo grupo"`;
    `"avisarQuemPediuAlerta não casa grupos diferentes"`;
    `"cadastrarPelaPalavraChave não consulta leads de outro grupo"`;
    `"/api/clique-whatsapp descarta corretorId de outro grupo"`;
    `"integracaoLiberada só para o grupo 1"`.
  - Guarda `portas.test.ts`: lê os arquivos acima e reprova `.from("leads")`,
    `.from("empreendimentos")` ou `.from("corretores")` de leitura sem
    `grupo_id` no mesmo encadeamento (remove comentários antes de procurar).
- [ ] **Step 2:** Rode. Esperado: FAIL.
- [ ] **Step 3:** Implemente conforme Interfaces.
- [ ] **Step 4:** Suíte + `npm test` + `npx tsc --noEmit` verdes. Provoque a
  guarda (tire o filtro de grupo de `processarEmail.ts`), confira por md5, veja
  reprovar, desfaça.
- [ ] **Step 5:** Commit `"Portas de entrada leem dentro do grupo"`.

---

### Task 10: Ambiente de testes com deploy, e o E2E fora de produção

O §13 põe na fase 1 "ambiente de testes separado de produção (banco e
deploy)"; o banco local da Task 1 cobre só a suíte de isolamento. (L23, L24)

**Files:**
- Modify: `.github/workflows/e2e.yml`
- Modify: `playwright.config.ts`
- Modify: `scripts/eval/exportarGolden.ts`
- Create: `docs/AMBIENTE-DE-TESTES.md`

**Interfaces:**
- Projeto Supabase de testes (criado pelo Matheus), com as migrations aplicadas
  do zero pelo mesmo `dbTeste.mjs` apontado para ele, e dados sintéticos de
  dois grupos (o `criarGrupo` da Task 2).
- Ambiente da Vercel `teste` (Custom Environment ou Preview com variáveis
  próprias) apontando para esse projeto; nenhuma chave de produção nele.
- `e2e.yml`: `E2E_BASE_URL` passa a ser a URL do ambiente de teste; a
  credencial é de um usuário sintético; `upload-artifact` de `test-results/`
  sai (ou fica com `if: false` até o repositório fechar).
- `exportarGolden.ts`: deixa de escrever conversa real em `eval/golden/`; só
  roda com `--grupo` do grupo 1 e grava fora do repositório.

**Passos:**
- [ ] **Step 1: Teste que falha.** Guarda `ambienteDeTestes.test.ts`: lê
  `e2e.yml` e reprova se `E2E_BASE_URL` contém `next-home-drab.vercel.app` ou
  `nexthomeimoveis.com`, ou se há `upload-artifact` de `test-results`.
- [ ] **Step 2:** Rode. Esperado: FAIL.
- [ ] **Step 3:** Escreva `docs/AMBIENTE-DE-TESTES.md` com o passo a passo
  para o Matheus criar o projeto e o ambiente (**depende dele**); ajuste o
  workflow. Sem o projeto criado, o workflow fica só com `workflow_dispatch`
  (sem `schedule`) e a guarda registra o motivo.
- [ ] **Step 4:** Rode o E2E contra o ambiente de teste e confira verde.
  Provoque a guarda (volte a URL de produção), confira por md5, veja
  reprovar, desfaça.
- [ ] **Step 5:** Commit `"E2E contra ambiente de testes, sem traço público"`.

**Ordem de execução das tarefas:** 1 → 2 → 11 → 3 → 4 → 12 → 5 → 6 → 7 → 8 → 10 → 9.


## Fora desta fase (não fazer aqui)

- Leitura pública fora da chave `anon`, cache e site por grupo → fase 3.
- Painel da plataforma, criação de grupo pela tela, medidor → fase 2.
- `empreendimentos.slug` por grupo → fase 3.
- Função de saída do corretor (`nexthome.transferindo_grupo`) → fase 5.
