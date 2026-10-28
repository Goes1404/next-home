# Agenda fase 2 — equipe, números e visita passada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O gestor vê a Agenda da equipe (mês + dia + números do mês com 6 meses de comparação, filtro por corretor) e passa uma visita de um corretor para outro sem mexer no dono do lead.

**Architecture:** Migration 0225 marca a visita passada (`passada_em`) para o espelho do lead não desfazer a passagem, faz a reserva da IA usar a grade de quem faz a visita e cria `numeros_da_agenda` (contagem no banco, mês de SP). Leitores novos em `src/lib/agenda/lerEquipe.ts` (chave de serviço, sempre filtrando o grupo da sessão). A tela `/corretor/agenda` ganha `?ver=equipe&corretor=` para o gestor.

**Tech Stack:** Next.js App Router (searchParams é Promise), Supabase Postgres, Vitest (`npx vitest run --dir src`; banco: `DB_TESTE_URL`).

**Spec:** `docs/superpowers/specs/2026-10-27-agenda-do-corretor-e-da-equipe-design.md` (seções 3.2, 3.3).

## Global Constraints

- Fuso: dia, hora e mês SEMPRE de `America/Sao_Paulo` (`at time zone` no SQL, `timeZone` no Intl).
- Nenhuma lista na tela com mais de 30 linhas (`MAXIMO_POR_DIA`); contagens no servidor.
- Tabela/coluna nova segue o bloco de grupo da casa; tudo que lê `visitas` usa a chave de serviço e filtra `grupo_id` da sessão.
- Corretor não vê agenda de colega; gestor só vê o próprio grupo.
- Ao passar a visita: só a visita muda, o lead continua do dono; cliente não é avisado; corretor que recebe e que perde são avisados (`avisarCorretor`).
- Quem recebe a visita (B) vê os dados do lead SEM a conversa.
- Zero jargão para o corretor. Visual do painel (`cartao`, `botao-*`), sem rolagem lateral em 320px.

## Review Focus

1. Remarcação pela IA de visita passada: a visita continua com B (não volta ao dono) e a IA oferece a grade de B.
2. Troca de dono do lead com visita passada a B: a visita fica com B.
3. Gestor de outro grupo / corretor comum chamando `passarVisita` ou abrindo `/corretor/agenda/visita/[id]`: recusado.
4. Mês com visita às 22h do dia 31 (SP): conta no mês 31, não no seguinte.
5. "Virou negócio" contado uma vez por lead, na última visita realizada antes da etapa.

---

### Task 1: Migration 0225 (visita passada, reserva por quem faz, números)

**Files:**
- Create: `supabase/migrations/0223_visita_passada_e_numeros_da_agenda.sql`
- Create: `src/lib/agenda/apoioDaAgendaNoBanco.ts` (helpers de teste `novoCorretor`, `novoLead`, `daqui`, `marcar`, `visitasDo` movidos de `visitas.db.test.ts`)
- Create: `src/lib/agenda/agendaDaEquipe.db.test.ts`
- Modify: `src/lib/agenda/visitas.db.test.ts` (importar os helpers)
- Modify: `src/lib/supabase/types.ts` (colunas novas, função nova)

**Produces:**
- `visitas.passada_em timestamptz null`, `visitas.passada_por_usuario uuid null`.
- `espelhar_visita_do_lead()`: troca de dono só move `passada_em is null`; remarcação mantém `corretor_id` quando `passada_em is not null`.
- `reservar_horario_visita`: grade de quem faz a visita marcada atual do lead (passada) senão do dono.
- `public.numeros_da_agenda(p_grupo uuid, p_corretor uuid, p_de date, p_ate date) returns table (mes date, marcadas int, realizadas int, faltas int, sem_confirmacao int, negocios int)` — `stable`, só `service_role`. `mes` = `date_trunc('month', inicio at time zone 'America/Sao_Paulo')::date`; marcadas = status ≠ cancelada; negócio: por lead, primeiro `lead_interacoes` tipo `etapa` com `detalhes->>'para' in ('proposta','documentacao','fechado')` depois da primeira visita realizada do lead, atribuído à última visita realizada com `inicio` antes do evento; `p_corretor` filtra `visitas.corretor_id` (quem fez).

- [ ] **Step 1: Write failing DB tests** em `agendaDaEquipe.db.test.ts`:
  - `"visita passada fica com quem recebeu quando o dono do lead muda"`
  - `"remarcar visita passada mantém quem recebeu"`
  - `"a reserva da IA usa a grade de quem faz a visita passada"` (B com grade só domingo; reserva num sábado devolve false)
  - `"numeros_da_agenda conta no mês de São Paulo"` (visita 31/jan 22h SP conta em janeiro)
  - `"cancelada não entra em marcadas; realizada, faltou e sem_confirmacao contam à parte"`
  - `"negócio conta uma vez por lead, na última visita realizada antes da proposta"`
  - `"filtro por corretor conta pelo corretor que fez a visita"`
- [ ] **Step 2:** `DB_TESTE_URL=… npx vitest run src/lib/agenda/agendaDaEquipe.db.test.ts` → FAIL (coluna/função não existe).
- [ ] **Step 3:** Escrever a 0225 (begin; lock_timeout 5s; `create or replace` do espelho a partir da 0224; reserva; função; grants; commit). Aplicar no banco local.
- [ ] **Step 4:** Rodar os testes de banco das duas suítes → PASS.
- [ ] **Step 5:** Commit `feat(agenda): visita passada e números da agenda no banco (0225)`.

### Task 2: Leitores da equipe e da visita passada

**Files:**
- Create: `src/lib/agenda/numeros.ts`, `src/lib/agenda/numeros.test.ts`
- Create: `src/lib/agenda/lerEquipe.ts`, `src/lib/agenda/lerEquipe.test.ts`
- Modify: `src/lib/agenda/itens.ts` (campos da visita), `src/lib/agenda/lerAgenda.ts`, `src/lib/agenda/lerAgenda.test.ts`
- Modify: `src/lib/grupos/servicoComGrupo.test.ts` (MAPA: `lerEquipe.ts` = equipe)

**Produces:**
- `itens.ts` visita ganha `corretorId: string`, `corretorNome: string | null`, `donoDoLeadId: string | null`, `passada: boolean`, `status: string`.
- `numeros.ts` (puro): `type NumerosDoMes = { mes: Mes; marcadas: number; realizadas: number; faltas: number; semConfirmacao: number; negocios: number }`; `mesesAteh(ate: Mes, quantos: number): Mes[]` (mais antigo primeiro); `montarSerie(linhas: NumerosDoMes[], meses: Mes[], medidaDesde: Mes | null): ({ medido: true } & NumerosDoMes | { medido: false; mes: Mes })[]` (mês antes de `medidaDesde` ou `medidaDesde` null → não medido; mês medido sem linha → zeros).
- `lerEquipe.ts` (server-only): `lerMarcadoresDaEquipe({ grupoId, corretorId: string | null, mes })`, `lerDiaDaEquipe({ grupoId, corretorId, dia }): Promise<{ itens: VisitaDaAgenda[]; total: number }>`, `lerNumerosDaAgenda({ grupoId, corretorId, mes }): Promise<SerieDeNumeros>` (RPC + `min(created_at)` das visitas do grupo), `lerVisitasDeHojeDaEquipe({ grupoId, agora })`.
- `lerAgenda.ts`: o corretor também vê as visitas dos leads DELE feitas por outro (`passada_em` não nulo), com `corretorNome` de quem faz; `lerPreparo(ids)` lê o preparo pela chave de serviço só para ids já autorizados.

- [ ] **Step 1: Failing tests:** `numeros.test.ts` (`mesesAteh("2026-03", 6)` atravessa o ano; `montarSerie` com `medidaDesde` no meio da janela; mês medido sem linha = zeros); `lerEquipe.test.ts` (filtra `grupo_id`, filtra `corretor_id` só quando passado, exclui cancelada, teto 30 e `total` real); `lerAgenda.test.ts` (visita passada do lead do corretor entra com `corretorNome`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run → PASS; `npx vitest run src/lib/grupos` → PASS.
- [ ] **Step 5:** Commit `feat(agenda): leitores da equipe, números e visita passada`.

### Task 3: Passar visita, página da visita para quem recebe, IA com a grade certa

**Files:**
- Modify: `src/app/corretor/(painel)/agenda/acoes.ts` (+ `passarVisita`)
- Create: `src/app/corretor/(painel)/agenda/acoes.test.ts`
- Create: `src/app/corretor/(painel)/agenda/visita/[id]/page.tsx`
- Create: `src/lib/agenda/lerVisitaRecebida.ts` (+ test)
- Modify: `src/lib/crm/agendaDoCorretor.ts` (+ `quemFazAVisitaDoLead(leadId, donoId): Promise<string>`), `src/app/api/webhooks/whatsapp/route.ts` (horários da IA)

**Produces:**
- `passarVisita(visitaId: string, paraCorretorId: string): Promise<{ erro?: string }>`: `exigirGestorNaAcao`; visita do grupo do gestor, `marcada`, `inicio >= now()`; destino ativo do mesmo grupo; update `corretor_id`, `passada_em = para === dono ? null : now()`, `passada_por_usuario`; conflito (`ehConflitoDeHorario`) → `"Esse corretor já tem outra visita nesse horário."`; `lead_interacoes` `sistema`; `avisarCorretor` para quem recebe e para quem perde; `revalidatePath("/corretor/agenda")`.
- `lerVisitaRecebida({ visitaId, corretorId, grupoId })`: devolve dados do lead (nome, telefone, imóvel, preferências, preparo, 5 últimas anotações do lead) só se a visita é do corretor, do grupo e `marcada`; senão null. Nunca lê conversa.
- Webhook: `horariosReais: await horariosDeVisitaSeguros(await quemFazAVisitaDoLead(lead.id, instancia.corretorId))`.

- [ ] **Step 1: Failing tests:** `acoes.test.ts` — corretor comum recebe erro; visita de outro grupo → erro; conflito → mensagem; passar ao dono zera `passada_em`; avisa os dois. `lerVisitaRecebida.test.ts` — outra pessoa/visita não marcada → null; nunca consulta `whatsapp_mensagens`. `agendaDoCorretor.test.ts` — `quemFazAVisitaDoLead` devolve B quando há visita passada marcada, senão o dono.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar (página: `notFound()` quando null; link "Abrir ficha" do cartão vai para a página quando `donoDoLeadId !== corretor`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(agenda): gestor passa a visita para outro corretor`.

### Task 4: Telas — Minha/Equipe, filtro, números, lista da equipe, Início do gestor

**Files:**
- Modify: `src/app/corretor/(painel)/agenda/page.tsx`, `_componentes/MesCompacto.tsx` (prop `consulta`), `_componentes/CartaoDaVisita.tsx` ("feita por", link da ficha)
- Create: `_componentes/ChaveDaVisao.tsx`, `_componentes/FiltroDeCorretor.tsx`, `_componentes/NumerosDoMes.tsx`, `_componentes/ListaDaEquipe.tsx`
- Create: `src/app/corretor/(painel)/_componentes/EquipeHoje.tsx` (+ test), wire em `(painel)/page.tsx` só para gestor
- Tests: `NumerosDoMes.test.tsx`, `MesCompacto.test.tsx`

**Produces:** `?ver=equipe` só para `papel === "gestor"` (corretor comum ignora o parâmetro); filtro por links (sem JS); números com variação contra o mês anterior e tabela de 6 meses; mês não medido escrito "ainda não medido" e a frase "A Agenda começou a contar em <mês>."; lista da equipe com hora, cliente, corretor, imóvel, status, e `<details>` "Passar para outro corretor" (form com `<select>` + server action) nas futuras marcadas; "Mostrando 30 de N" quando corta; bloqueio aparece na fase 3.

- [ ] **Step 1: Failing tests:** `NumerosDoMes.test.tsx` (não medido não vira zero; variação "+2 que setembro"); `MesCompacto.test.tsx` (links preservam `ver=equipe&corretor=`); `EquipeHoje.test.tsx` (some sem visita; falha de leitura → null).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run --dir src` → PASS; `npx tsc --noEmit` só os 4 erros conhecidos do PixelMeta.
- [ ] **Step 5:** Commit `feat(agenda): agenda da equipe com números e filtro`.

### Task 5: Registro

- [ ] Nota `vault/10-notas/agenda-da-equipe-e-visita-passada.md` + MOC CRM e Painel; seção no fim da `docs/MEMORIA.md`; handoff (0225 antes do deploy). Commit `docs(agenda): fase 2 no vault e na memória`.
