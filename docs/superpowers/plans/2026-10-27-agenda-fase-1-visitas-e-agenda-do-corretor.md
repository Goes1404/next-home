# Agenda — Fase 1: visitas com histórico e Agenda do corretor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda visita passa a ter linha própria com histórico (`visitas`), e a tela "Visitas" vira "Agenda": mês compacto + lista do dia com visitas, tarefas e lembretes do próprio corretor, e um cartão "Hoje na agenda" no Início.

**Architecture:** `leads.visita_agendada_em` continua sendo a porta de escrita (os 5 escritores e ~30 leitores de hoje não mudam). Um gatilho em `leads` espelha cada mudança da coluna para `visitas` (marcar = linha nova, remarcar futura = mesma linha com `datas_anteriores`, desmarcar = `cancelada`). A trava de conflito passa a ser uma exclusão declarativa de 60 min por corretor em `visitas`. A tela lê `visitas`, `lead_tarefas` e `anotacoes` pela chave de serviço, sempre filtrando grupo e corretor da sessão.

**Tech Stack:** Next.js App Router (versão do repo — ler `node_modules/next/dist/docs/` antes de codar), Supabase Postgres (migration SQL, `btree_gist`), Vitest (unitário e `.db.test.ts` contra o banco local), Tailwind do painel.

**Spec:** `docs/superpowers/specs/2026-10-27-agenda-do-corretor-e-da-equipe-design.md`

**Desvio consciente da spec (§7, "espelho"):** a spec sugeriu `visitas` como fonte e a coluna do lead como espelho. Este plano inverte (lead → `visitas`) porque assim nenhum escritor da IA, do retorno pelo grupo, do chat ou do painel muda nesta fase — o risco de quebrar o agendamento da Sofia é zero. A Fase 2 ("passar visita para B") escreve direto em `visitas.corretor_id`, o que é compatível.

**Publicação:** Fases 1 e 2 sobem JUNTAS. Esta fase mostra só "Minha" agenda; a tela antiga de Visitas mostrava a equipe ao gestor, e essa visão volta na Fase 2.

## Global Constraints

- Dia, hora e mês SEMPRE em `America/Sao_Paulo`: no TS por `Intl.DateTimeFormat` com `timeZone`, no SQL por `at time zone 'America/Sao_Paulo'`. Nunca `Date.getDay()`/`getDate()`/`getMonth()` sobre instante.
- Tabela nova: `grupo_id`, gatilhos `<tabela>_00_grupo` / `<tabela>_zz_grupo_update` / `<tabela>_zz_grupo_insert`, policy restritiva `isolamento_por_grupo`, `revoke all` de `anon` e `authenticated` — copiar o bloco de `supabase/migrations/0204_roleta_dos_anuncios.sql:41-66`.
- Migration nova: `supabase/migrations/0222_visitas_com_historico.sql` (conferir que 0222 está livre em `origin/*` e fora de `RESERVADOS` em `src/lib/migrations.test.ts`). Aditiva; aplicada em produção ANTES do deploy.
- Duração da visita: 60 min (`DURACAO_VISITA_MIN` em `src/lib/crm/agendaIcs.ts`).
- Mensagem de conflito no painel, exata: `Você já tem outra visita nesse horário.`
- Régua do Painel de Bolso: nenhuma lista na tela recebe mais que 30 itens; contagens do mês vêm agregadas.
- Zero jargão na tela ("cota", "fila", "instância" não aparecem).
- Testes: `npx vitest run --dir src` (nunca sem `--dir src`: pega cópia velha em `.claude/worktrees/`). Banco: `npm run db:teste` e `DB_TESTE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run src/lib/agenda/visitas.db.test.ts src/lib/grupos/isolamento.db.test.ts`.
- `next build` local cai no PixelMeta (Windows) DEPOIS de "Compiled": rodar mesmo assim para pegar import de servidor em componente cliente; peso confere o CI (`npm run bundle:teto`).

## Review Focus

1. Visita às 22h30 de SP do dia 31/10 aparece em 31/10 e no mês de outubro (em UTC já é 01/11) — teste em Task 3.
2. Lead com visita PASSADA que ganha data nova cria visita NOVA (o passado não é reescrito como remarcação); visita FUTURA remarcada é a mesma linha com a data velha em `datas_anteriores` — teste em Task 1.
3. Trocar o dono do lead (saída do corretor, roleta) com visita futura que bate com outra do novo dono NÃO pode derrubar o `update` do lead — teste em Task 1.
4. `?mes=2026-13`, `?mes=abc`, `?dia=2026-02-30`, `?dia` de outro mês → cai no mês/dia atual de SP, sem 500 — teste em Task 3.
5. Duas visitas do mesmo corretor com 30 min de diferença: a segunda é recusada; a IA recebe `false` (sem exceção) e o painel mostra a mensagem de conflito — testes em Task 1 (banco) e Task 2 (ações).

---

### Task 0: Branch de trabalho

- [ ] **Step 1:** `git fetch origin && git worktree add ../next-home-agenda -b agenda-fase-1 origin/main && cd ../next-home-agenda && npm ci` (skill `superpowers:using-git-worktrees`). Expected: worktree limpo em `origin/main`.
- [ ] **Step 2:** copiar a spec e este plano do worktree principal (ainda não commitados lá) para os mesmos caminhos no worktree novo e `git commit -m "docs(agenda): desenho e plano da fase 1"`.

### Task 1: Tabela `visitas`, espelho do lead e trava de 60 min

**Files:**
- Create: `supabase/migrations/0222_visitas_com_historico.sql`
- Create: `src/lib/agenda/visitas.db.test.ts`
- Create: `src/lib/agenda/migracaoVisitas.test.ts`
- Modify: `src/lib/supabase/types.ts` (bloco `visitas` em `Tables`)

**Interfaces:**
- Produces (banco): tabela `public.visitas`:
  `id uuid pk default gen_random_uuid()`, `grupo_id uuid not null → grupos on delete cascade`, `lead_id uuid not null → leads on delete cascade`, `corretor_id uuid not null → corretores on delete cascade` (quem FAZ a visita), `inicio timestamptz not null`, `fim timestamptz not null check (fim > inicio)`, `status text not null default 'marcada' check (status in ('marcada','realizada','faltou','cancelada','sem_confirmacao'))`, `datas_anteriores timestamptz[] not null default '{}'`, `criada_por_usuario uuid` (= `auth.uid()` no momento; nulo = sistema/IA), `created_at timestamptz not null default now()`, `atualizado_em timestamptz not null default now()`.
  Índices: `(grupo_id, inicio)`, `(corretor_id, inicio)`, `(lead_id, inicio desc)`.
  Exclusão: `visitas_sem_conflito exclude using gist (corretor_id with =, tstzrange(inicio, fim, '[)') with &&) where (status = 'marcada')`.
- Produces (banco): função `public.espelhar_visita_do_lead()` (trigger, `security definer`, `search_path = public`) e gatilho `leads_zz_espelha_visita after insert or update of visita_agendada_em, corretor_id on public.leads`.
- Produces (banco): `reservar_horario_visita(uuid, timestamptz)` recriada igual à da `0165_funil_de_dez_etapas.sql:44-99`, mudando só o `exception` para `when unique_violation or exclusion_violation then return false;`; reaplicar o `revoke`/`grant` da `0192` (só `service_role`).
- Produces (TS): `Database["public"]["Tables"]["visitas"]` com `Row`/`Insert`/`Update`/`Relationships` no formato dos vizinhos.

Regras do gatilho (o corpo é do implementador; estas são as decisões):

| Evento em `leads` | Efeito em `visitas` |
|---|---|
| `visita_agendada_em` nulo → X (ou insert com X), `corretor_id` não nulo | insere `marcada`, `inicio = X`, `fim = X + 60 min`, `corretor_id = leads.corretor_id`, `grupo_id = leads.grupo_id` |
| X → nulo | a linha `marcada` do lead com `inicio = X` vira `cancelada` |
| X → Y, com `X >= now()` e existe `marcada` com `inicio = X` | mesma linha: `inicio = Y`, `fim = Y + 60 min`, `datas_anteriores = datas_anteriores \|\| X` |
| X → Y, com `X < now()` (visita já passou) | insere linha nova para Y; a de X fica como está |
| `corretor_id` A → B | linhas `marcada` futuras do lead com `corretor_id = A` passam a B; se a exclusão recusar, captura `exclusion_violation`, deixa a linha com A e faz `raise warning` — o `update` do lead NUNCA falha por isso |
| conflito ao inserir/remarcar | a `exclusion_violation` sobe (é ela que faz a reserva recusar) |

Toda escrita do gatilho atualiza `atualizado_em = now()`.

Backfill no fim da migration: um bloco `do $$ … $$` insere uma `marcada` para cada lead com `visita_agendada_em >= now()` e `corretor_id` não nulo, linha a linha, capturando `exclusion_violation` com `raise notice` (conflito herdado não aborta a migration). Visitas passadas NÃO entram (os números começam do zero — spec §3.2).

- [ ] **Step 1: Escrever o teste de texto da migration** em `src/lib/agenda/migracaoVisitas.test.ts`, no estilo de `src/lib/crm/enviosDeLeadParaGrupo.test.ts:140-150`: lê o SQL e espera `create policy isolamento_por_grupo on public.visitas as restrictive`, os três gatilhos `visitas_00_grupo`/`visitas_zz_grupo_update`/`visitas_zz_grupo_insert`, `revoke all on public.visitas from anon`, `revoke all on public.visitas from authenticated`, `create extension if not exists btree_gist`, `exclude using gist`, e `exclusion_violation` dentro de `reservar_horario_visita`.
- [ ] **Step 2: Escrever os testes de banco** em `src/lib/agenda/visitas.db.test.ts` (pula sem `DB_TESTE_URL`; cada teste em `emTransacaoDesfeita`; grupo/corretor/lead por `criarGrupo` e afins de `src/lib/grupos/apoioDoBanco.ts`):
  - `marcar visita cria uma linha marcada de 60 min` → 1 linha, `status='marcada'`, `fim - inicio = 1 hour`, `corretor_id` = dono do lead.
  - `remarcar visita futura reescreve a mesma linha e guarda a data velha` → continua 1 linha, `inicio` = nova, `datas_anteriores = {velha}`.
  - `data nova em lead com visita passada cria outra visita` → 2 linhas; a passada intacta.
  - `desmarcar vira cancelada` → `status='cancelada'`; uma nova visita no mesmo horário depois passa.
  - `segunda visita 30 min depois é recusada` → `update leads set visita_agendada_em` do 2º lead (mesmo corretor, +30 min) lança `23P01`; `select reservar_horario_visita(lead2, +30min)` devolve `false`.
  - `visita 60 min depois passa` → +60 min não conflita (`'[)'`).
  - `trocar o dono do lead com conflito não derruba o update` → lead L de A com visita amanhã 10h; B já tem visita amanhã 10h; `update leads set corretor_id = B where id = L` passa; a visita de L continua com A.
  - `trocar o dono sem conflito leva a visita futura junto` → `corretor_id` da visita = B.
  - `grupo da visita é o do lead` → `grupo_id` igual ao do lead.
- [ ] **Step 3: Rodar e ver falhar.** `npx vitest run --dir src src/lib/agenda/migracaoVisitas.test.ts` → FAIL (arquivo não existe). `npm run db:teste` e o comando de banco das Global Constraints → FAIL (`relation "visitas" does not exist`).
- [ ] **Step 4: Escrever a migration** conforme Interfaces e a tabela de regras. Também `comment on table public.visitas is 'Uma linha por visita, com histórico (0222). Espelho de leads.visita_agendada_em pelo gatilho leads_zz_espelha_visita. Só o servidor lê e grava.'`.
- [ ] **Step 5: Subir o banco de novo e rodar.** `npm run db:teste` (aplica TODAS as migrations do zero) + testes de banco desta task + `src/lib/grupos/isolamento.db.test.ts` → PASS (a suíte de isolamento confere grupo, gatilhos e policy de toda tabela).
- [ ] **Step 6: Tipos.** Acrescentar `visitas` em `src/lib/supabase/types.ts` (ou gerar contra o banco local e copiar só o bloco novo). `npx tsc --noEmit -p .` → só os 4 erros conhecidos do PixelMeta.
- [ ] **Step 7: Commit.** `git add supabase/migrations/0222_visitas_com_historico.sql src/lib/agenda/ src/lib/supabase/types.ts && git commit -m "feat(agenda): visitas com histórico espelhadas do lead (0222)"`

### Task 2: Conflito de 60 min com mensagem certa nos escritores

**Files:**
- Create: `src/lib/agenda/conflito.ts`, `src/lib/agenda/conflito.test.ts`
- Modify: `src/app/corretor/actions.ts:648-668` (`definirVisitaEm`)
- Modify: `src/app/corretor/(painel)/_componentes/acoesVisitaCombinada.ts:66-71` (`registrarVisitaCombinada`)
- Modify: `src/lib/crm/retornoPeloGrupo/aplicarAoLead.ts:250-255` (só o comentário: a trava agora é a exclusão de 60 min da 0222)

**Interfaces:**
- Produces: `export function ehConflitoDeHorario(erro: { code?: string } | null | undefined): boolean` — `true` para `"23505"` (índice da 0074) e `"23P01"` (exclusão da 0222).
- Produces: `export const MENSAGEM_CONFLITO = "Você já tem outra visita nesse horário."`

- [ ] **Step 1: Teste.** `conflito.test.ts`: `ehConflitoDeHorario({ code: "23P01" })` e `({ code: "23505" })` → `true`; `({ code: "42501" })`, `null`, `undefined` → `false`.
- [ ] **Step 2:** `npx vitest run --dir src src/lib/agenda/conflito.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `conflito.ts`. Em `definirVisitaEm`, quando o `update` der erro e `ehConflitoDeHorario(error)`, devolver `{ erro: MENSAGEM_CONFLITO }` (hoje devolve "Não foi possível salvar agora."). Em `registrarVisitaCombinada`, trocar `error.code === "23505"` por `ehConflitoDeHorario(error)` e a string por `MENSAGEM_CONFLITO`. Trocar `revalidatePath("/corretor/visitas")` por `revalidatePath("/corretor/agenda")` nesses dois arquivos.
- [ ] **Step 4:** `npx vitest run --dir src` → PASS (nenhuma guarda existente quebra).
- [ ] **Step 5: Commit.** `git commit -m "feat(agenda): conflito de 60 min com mensagem clara no painel"`

### Task 3: Calendário no fuso de São Paulo (puro)

**Files:**
- Create: `src/lib/agenda/calendario.ts`, `src/lib/agenda/calendario.test.ts`

**Interfaces (Produces):**
- `export type Mes = string` — `"YYYY-MM"`; `export type Dia = string` — `"YYYY-MM-DD"`.
- `export function diaEmSaoPaulo(instante: Date): Dia`
- `export function mesDoDia(dia: Dia): Mes`
- `export function lerMes(param: string | undefined, agora: Date): Mes` — aceita só `^\d{4}-(0[1-9]|1[0-2])$`; senão o mês de `agora` em SP.
- `export function lerDia(param: string | undefined, mes: Mes, agora: Date): Dia` — aceita só data real (`2026-02-30` não) dentro de `mes`; senão hoje (se hoje é de `mes`) ou o dia 1 de `mes`.
- `export function limitesDoDia(dia: Dia): { inicio: Date; fim: Date }` — `fim` exclusivo (meia-noite seguinte, -03:00 fixo, como `instanteEmSaoPaulo` em `src/lib/crm/agendaDeVisitas.ts:105`).
- `export function limitesDoMes(mes: Mes): { inicio: Date; fim: Date }` — dia 1 00:00 SP até dia 1 do mês seguinte 00:00 SP.
- `export function semanasDoMes(mes: Mes): (Dia | null)[][]` — semanas de domingo a sábado; `null` nas casas fora do mês.
- `export function mesVizinho(mes: Mes, passo: -1 | 1): Mes`
- `export function rotuloDoMes(mes: Mes): string` — `"outubro de 2026"` (pt-BR).

- [ ] **Step 1: Testes** (valores exatos):
  - `diaEmSaoPaulo(new Date("2026-11-01T01:30:00Z"))` → `"2026-10-31"` (22h30 de SP).
  - `limitesDoMes("2026-10")` → `inicio.toISOString() === "2026-10-01T03:00:00.000Z"`, `fim.toISOString() === "2026-11-01T03:00:00.000Z"`.
  - `semanasDoMes("2026-10")[0]` → `[null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]` (01/10/2026 é quinta); todas as semanas com 7 casas; última contém `"2026-10-31"`.
  - `lerMes("2026-13", agora)`, `lerMes("abc", agora)`, `lerMes(undefined, agora)` → mês de `agora` em SP; `lerMes("2026-09", agora)` → `"2026-09"`.
  - `lerDia("2026-02-30", "2026-02", agora)` → `"2026-02-01"` quando `agora` é de outro mês; `lerDia("2026-09-15", "2026-10", agora)` → recusa (é de outro mês).
  - `mesVizinho("2026-12", 1)` → `"2027-01"`; `mesVizinho("2026-01", -1)` → `"2025-12"`.
  - `rotuloDoMes("2026-10")` → `"outubro de 2026"`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar (aritmética de dia-calendário em meio-dia UTC, como `somarDias` em `agendaDeVisitas.ts:110`). **Step 4:** rodar → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(agenda): calendário do mês no fuso de São Paulo"`

### Task 4: Leitura da agenda do corretor

**Files:**
- Create: `src/lib/agenda/itens.ts` (puro), `src/lib/agenda/itens.test.ts`
- Create: `src/lib/agenda/lerAgenda.ts` (servidor)
- Modify: `src/lib/grupos/servicoComGrupo.test.ts` (entrada do MAPA para `lerAgenda.ts`)

**Interfaces:**
- Consumes: `Dia`, `Mes`, `limitesDoDia`, `limitesDoMes`, `diaEmSaoPaulo` (Task 3).
- Produces (puro, `itens.ts`):
  ```ts
  export type ItemDaAgenda =
    | { tipo: "visita"; id: string; inicio: string; leadId: string; nome: string; telefone: string | null;
        imovel: { nome: string; endereco: string | null } | null; confirmadaPeloCliente: boolean }
    | { tipo: "tarefa"; id: string; inicio: string; titulo: string; leadId: string | null; nome: string | null }
    | { tipo: "lembrete"; id: string; inicio: string; texto: string; leadId: string | null };
  export function ordenarItens(itens: ItemDaAgenda[]): ItemDaAgenda[]; // por inicio; empate: visita, tarefa, lembrete
  export function contarPorDia(instantes: string[]): Record<Dia, number>; // chave = diaEmSaoPaulo
  export const MAXIMO_POR_DIA = 30;
  ```
- Produces (servidor, `lerAgenda.ts`; recebe ids JÁ conferidos pela sessão):
  ```ts
  export async function lerMarcadoresDoMes(p: { corretorId: string; grupoId: string; mes: Mes }): Promise<Record<Dia, number>>;
  export async function lerItensDoDia(p: { corretorId: string; grupoId: string; dia: Dia }): Promise<ItemDaAgenda[]>;
  export async function lerProximasVisitas(p: { corretorId: string; grupoId: string; agora: Date; limite: number }): Promise<Extract<ItemDaAgenda, { tipo: "visita" }>[]>;
  ```
  Fontes, todas com `.eq("grupo_id", grupoId)` no mesmo encadeamento:
  - `visitas` com `corretor_id = corretorId`, `status in ('marcada','realizada','sem_confirmacao')`, embed do lead (`nome, telefone, arquivado_em, visita_confirmada_em`, empreendimento `nome, endereco` com FK explícita `empreendimentos!leads_empreendimento_id_fkey`); lead arquivado fica fora. `confirmadaPeloCliente = visita_confirmada_em != null` só quando a visita é a atual do lead.
  - `lead_tarefas` com `corretor_id = corretorId`, `concluida_em is null`, `prazo` no intervalo.
  - `anotacoes` com `destinatario_id = corretorId`, `concluida_em is null`, `lembrete_em` no intervalo.
  - Marcadores: só a coluna de instante das três fontes no intervalo do mês, `.limit(1000)` cada, somadas por `contarPorDia`.
  - Lista do dia: no máximo `MAXIMO_POR_DIA` itens depois de `ordenarItens`.

- [ ] **Step 1: Testes puros** (`itens.test.ts`): `ordenarItens` ordena por `inicio` e desempata visita→tarefa→lembrete; `contarPorDia(["2026-11-01T01:30:00Z", "2026-10-31T15:00:00Z"])` → `{ "2026-10-31": 2 }`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar `itens.ts` e `lerAgenda.ts` (chave de serviço `createServiceClient`). **Step 4:** registrar `src/lib/agenda/lerAgenda.ts` no MAPA de `servicoComGrupo.test.ts` como categoria `equipe` (motivo: "agenda do próprio corretor; toda leitura filtra grupo e corretor da sessão") — seguir a mensagem de reprovação da guarda se ela pedir outra categoria.
- [ ] **Step 5:** `npx vitest run --dir src` → PASS (inclui `servicoComGrupo`, `embedsAmbiguos`).
- [ ] **Step 6: Commit.** `git commit -m "feat(agenda): leitura do mês e do dia do corretor"`

### Task 5: Tela Agenda (substitui Visitas)

**Files:**
- Create: `src/app/corretor/(painel)/agenda/page.tsx`, `agenda/loading.tsx`
- Create: `src/app/corretor/(painel)/agenda/_componentes/MesCompacto.tsx`, `ListaDoDia.tsx`, `CartaoDaVisita.tsx`
- Move: `visitas/_componentes/GradeDaSemana.tsx`, `visitas/_componentes/AgendaNoCelular.tsx`, `visitas/acoes.ts` → `agenda/` (mesmos nomes; `revalidatePath` para `/corretor/agenda`)
- Modify: `src/app/corretor/(painel)/visitas/page.tsx` → só `redirect("/corretor/agenda")`; apagar `visitas/loading.tsx`
- Modify: `src/app/corretor/(painel)/_componentes/navegacao.tsx:136` → `{ href: "/corretor/agenda", label: "Agenda", icone: IconeVisitas }`
- Modify: `src/app/corretor/(painel)/_componentes/contadoresDoMenu.ts:62` → chave `"/corretor/agenda"`
- Modify: `src/app/corretor/(painel)/_componentes/navegacao.test.ts:152,206,546,590` → `/corretor/agenda`
- Modify: demais `revalidatePath("/corretor/visitas")` (`git grep -n 'corretor/visitas'`) → `/corretor/agenda`

**Interfaces:**
- Consumes: `lerMes`, `lerDia`, `semanasDoMes`, `mesVizinho`, `rotuloDoMes`, `diaEmSaoPaulo` (Task 3); `lerMarcadoresDoMes`, `lerItensDoDia`, `lerProximasVisitas`, `ItemDaAgenda` (Task 4); `getCorretorLogado` (`src/lib/corretorSessao.ts`).
- `MesCompacto({ mes, diaSelecionado, hoje, marcadores }: { mes: Mes; diaSelecionado: Dia; hoje: Dia; marcadores: Record<Dia, number> })` — componente de servidor, sem JS: cada dia é `<Link href="?mes=…&dia=…">`; ponto quando `marcadores[dia] > 0`; hoje destacado; setas para `mesVizinho`. Alvo de toque ≥ 40px; cabe em 320px sem rolar de lado (`naoRolaDeLado.test.ts`).
- `ListaDoDia({ itens }: { itens: ItemDaAgenda[] })` — hora (SP) + tipo + texto; visita usa `CartaoDaVisita`; vazio: "Nada marcado neste dia."
- `CartaoDaVisita` — o `<article>` atual de `visitas/page.tsx:150-290` extraído como está (preparo, WhatsApp, GPS, Ligar, Abrir ficha, selo "Confirmada pelo cliente"), recebendo um item `tipo: "visita"` mais o preparo; a consulta do preparo (`visitas/page.tsx:73-115`) vai junto para a página.

Ordem da página (celular primeiro): cabeçalho `CabecalhoDeTela secao="Leads" titulo="Agenda"` → `MesCompacto` → `ListaDoDia` do dia selecionado → "Próximas visitas" (`lerProximasVisitas`, `limite: 10`, só quando o dia selecionado não tem visita) → `<details>` "Configurar horários" com `AgendaNoCelular` e `GradeDaSemana` (mesmas props de hoje).

- [ ] **Step 1: Ajustar os testes de navegação** (`navegacao.test.ts`) para `/corretor/agenda` e rótulo "Agenda" → rodar → FAIL.
- [ ] **Step 2: Implementar** página, componentes, movimentos e redirect. Ler antes `node_modules/next/dist/docs/` sobre `searchParams` (Promise) e `redirect` nesta versão.
- [ ] **Step 3:** `npx vitest run --dir src` → PASS (inclui `naoRolaDeLado`, `botoesComPista`, `menuLateral`, `painelLeve`).
- [ ] **Step 4: Ver no navegador** (skill `run`; Playwright em 360×780): `/corretor/agenda` abre no mês atual com hoje selecionado; tocar num dia com ponto mostra os itens; `/corretor/visitas` cai em `/corretor/agenda`; `?mes=abc` abre o mês atual. Tirar print em 360px e em 1280px.
- [ ] **Step 5: Commit.** `git commit -m "feat(agenda): tela Agenda no lugar de Visitas"`

### Task 6: "Hoje na agenda" no Início

**Files:**
- Create: `src/app/corretor/(painel)/_componentes/HojeNaAgenda.tsx`, `src/lib/agenda/hoje.ts`, `src/lib/agenda/hoje.test.ts`
- Modify: `src/app/corretor/(painel)/page.tsx` (novo `<Suspense fallback={null}>` logo depois de `QuemEstaEsperando`, linha ~121)

**Interfaces:**
- Consumes: `lerItensDoDia`, `diaEmSaoPaulo`, `ItemDaAgenda`.
- Produces: `export function proximosDeHoje(itens: ItemDaAgenda[], agora: Date, quantos = 3): ItemDaAgenda[]` — itens com `inicio >= agora - 60 min`, na ordem, no máximo `quantos`.
- `HojeNaAgenda({ corretorId, grupoId })` — servidor; não renderiza nada quando `proximosDeHoje` vem vazio; cada linha "10:00 · Visita · Ana Souza"; link "Ver agenda" para `/corretor/agenda`.

- [ ] **Step 1: Teste** de `proximosDeHoje`: item de 1h30 atrás sai, de 30 min atrás fica, corta em 3.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run --dir src` → PASS (inclui `painelLeve.test.ts`).
- [ ] **Step 5: Commit.** `git commit -m "feat(agenda): próximos compromissos de hoje no Início"`

### Task 7: Verificação final e registro

- [ ] **Step 1:** `npx tsc --noEmit -p .` (só PixelMeta), `npx vitest run --dir src` (verde), `npm run db:teste` + suíte de banco (verde), `npx next build` até "Compiled" sem erro de import de servidor em cliente. Skill `superpowers:verification-before-completion`.
- [ ] **Step 2: Conferência de produção, só leitura** (skill `aplicar-migration-producao`, sem aplicar): `select l.corretor_id, l.visita_agendada_em, count(*) over (partition by l.corretor_id) from leads l where l.visita_agendada_em >= now() order by 1, 2;` — listar pares do mesmo corretor a menos de 60 min; anotar no handoff (o backfill pula esses com `notice`).
- [ ] **Step 3: Registro** (skill `fechar-tarefa`): nota `vault/10-notas/agenda-visitas-com-historico.md` (frontmatter completo; tags do `vocabulario-de-tags.md`), link no `MOC — CRM e Painel`, seção curta no fim de `docs/MEMORIA.md` (o espelho lead→visitas e por quê; a exclusão de 60 min; passado não migrado), e `docs/HANDOFF-MULTI-GRUPO.md` com a branch, a 0222 "aplicar ANTES" e "publicar junto com a Fase 2".
- [ ] **Step 4: Commit.** `git commit -m "docs(agenda): fase 1 no vault, na memória e no handoff"`
