# Ligação primeiro e retorno pelo grupo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A roleta dos anúncios ganha o modo "aviso no grupo para ligar" (e para de errar); o corretor manda o retorno da ligação no grupo dele, por texto ou áudio, e o CRM se atualiza; o gestor recebe às 18h a lista dos leads sem retorno.

**Architecture:** Tudo passa pelo número central do grupo (`grupos.envio_grupo_leads_instancia`) e pela fila `lead_envios_grupo` (0215), que vira o registro de "lead avisado". O webhook ganha UMA exceção estreita ao descarte de `@g.us`, que leva só para `src/lib/crm/retornoPeloGrupo/` e nunca ao motor de resposta. Regras de decisão ficam em módulos puros testados; banco e provedor ficam nas bordas.

**Tech Stack:** Next.js (versão do repo — ler `node_modules/next/dist/docs/` antes de mexer em rota), Supabase/Postgres, Evolution API, vitest, `chamarLlmJson` (`src/lib/whatsapp/llm.ts`), `transcreverAudioWhatsapp` (`src/lib/whatsapp/audioTranscriber.ts`).

**Spec:** `docs/superpowers/specs/2026-10-26-ligacao-primeiro-e-retorno-pelo-grupo-design.md` (ler inteiro antes da Task 1).

## Global Constraints

- Branch `ligacao-e-retorno-pelo-grupo`. Nunca push, nunca migration em produção sem OK do dono.
- Migrations aditivas: `0217` (Etapa 1) e `0218` (Etapas 2 e 3). Conferir antes `git ls-tree -r --name-only origin/claude/modernizar-plataforma-imobiliaria-2tm13q supabase/migrations | tail` (última usada: 0216).
- Tabela nova: `grupo_id`, gatilhos `_00_grupo` / `_zz_grupo_*`, policy restritiva `isolamento_por_grupo`, `revoke all` de `anon` e `authenticated` — copiar o bloco de `supabase/migrations/0204_roleta_dos_anuncios.sql`. Registrar a tabela nas listas de `src/lib/grupos/tabelasDoGrupo.ts` e testes irmãos (`servicoComGrupo.test.ts`, `contaOculta.test.ts`) quando o teste pedir.
- Toda leitura/escrita com chave de serviço filtra por `grupo_id`.
- Textos ao corretor/gestor sem jargão ("instância", "fila", "cota", "JID" proibidos).
- Fuso: `America/Sao_Paulo` para datas relativas, "18h" e "há mais de 3 horas".
- `null` não apaga dado do dossiê (usar `salvarDossie`, que já aplica `mesclarDossie`).
- Nada muda para grupo que não ligou o envio para grupos; Next Home igual.
- Testes: `npx vitest run --exclude ".claude/**" <arquivo>`; tipos: `npx tsc --noEmit -p .` (4 erros conhecidos de PixelMeta no Windows, ignorar só esses).
- Comentários e nomes em português, no estilo dos arquivos vizinhos (comentário explica o porquê).

## Review Focus

1. **Reentrega do webhook** (a Evolution reenvia a mesma mensagem do grupo): o retorno não pode ser gravado duas vezes → `unique` em `retornos_de_ligacao.mensagem_id` e teste na Task 9.
2. **Gestor falando no grupo** ("Fernando, liga logo pra ela"): ignorado em silêncio, nada gravado, nenhuma resposta → teste em `reconhecerAutorNoGrupo` (Task 7).
3. **"Sábado" dito num sábado / data passada / data a mais de 60 dias**: visita não é gravada com data absurda; vai sem visita e a confirmação pede a data → teste em `normalizarLeituraDoRetorno` (Task 8).
4. **Retorno para lead que já mudou de dono** (repassado a outro depois do aviso): não aplica no lead alheio; responde que o lead não é mais dele → teste em `escolherLeadDoRetorno` (Task 7).
5. **Lead do impulsionamento do próprio corretor** (etiqueta `corretor`) nunca vira "Novo lead distribuído" nem entra na lista do gestor → teste em `destinoDoAviso` (Task 4) e na consulta da Task 12.

---

## Etapa 1 — Roleta: modo aviso no grupo e correções

### Task 1: Migration 0217 (roleta)

**Files:**
- Create: `supabase/migrations/0217_roleta_aviso_no_grupo.sql`
- Modify: `src/lib/supabase/types.ts` (colunas e assinatura nova à mão, no padrão do arquivo)
- Test: `src/lib/crm/roletaAvisoNoGrupo.sql.test.ts`

**Interfaces:**
- Produces:
  - `roleta_anuncios.modo_aviso text not null default 'mensagem' check (modo_aviso in ('mensagem','grupo'))`
  - `proximo_da_roleta(p_corretor uuid, p_excluir uuid[] default '{}', p_modo text default 'mensagem') returns uuid` (drop da assinatura antiga de 2 args no mesmo arquivo; revoke/grant como na 0204)
  - `lead_envios_grupo.status` aceita também `'cancelado'`
  - `enfileirar_aviso_do_lead(p_lead uuid) returns void` (security definer, só `service_role`): upsert em `lead_envios_grupo` para o DONO ATUAL do lead; `on conflict (lead_id) do update` só se `status in ('pendente','erro')` (troca `corretor_id`, `grupo_jid`, `grupo_nome`, zera `tentativas`); não faz nada se o grupo não tem envio ativo, se o dono não tem JID, ou se `trazido_por = 'corretor'`.

- [ ] **Step 1: Teste que lê a migration (padrão de `enviosDeLeadParaGrupo.test.ts`)**

```ts
it("a roleta pula pausa e conta oculta, e no modo grupo exige grupo, não conexão", () => {
  const sql = ler("0217_roleta_aviso_no_grupo.sql");
  expect(sql).toMatch(/not c\.em_pausa/);
  expect(sql).toMatch(/not c\.oculta/);
  expect(sql).toMatch(/p_modo = 'grupo'[\s\S]*whatsapp_grupo_leads_jid is not null/);
  expect(sql).toMatch(/drop function if exists public\.proximo_da_roleta\(uuid, uuid\[\]\)/);
});
it("o aviso segue o dono atual e não reabre envio já feito", () => {
  const sql = ler("0217_roleta_aviso_no_grupo.sql");
  expect(sql).toContain("enfileirar_aviso_do_lead");
  expect(sql).toMatch(/where public\.lead_envios_grupo\.status in \('pendente', 'erro'\)/);
  expect(sql).toMatch(/trazido_por = 'corretor'/);
});
```

- [ ] **Step 2:** Rodar; esperado FAIL (arquivo não existe).
- [ ] **Step 3:** Escrever a migration. Em `p_modo = 'mensagem'` o filtro de conexão é o da 0204; em `'grupo'` troca por `c.whatsapp_grupo_leads_jid is not null` e exige `grupos.envio_grupo_leads_ativo`. Pausa e oculta valem nos dois.
- [ ] **Step 4:** Rodar o teste (PASS) e `npm run db:teste` + `npx vitest run src/lib/crm/roletaDeLeads.test.ts src/lib/migrations.test.ts --exclude ".claude/**"` (PASS). `npx supabase@2.121.0 stop --no-backup` ao fim.
- [ ] **Step 5:** Commit `feat(roleta): modo aviso no grupo e filtros de pausa e conta oculta (0217)`.

### Task 2: A roleta decide pelo modo e nunca avisa sem trocar o dono

**Files:**
- Modify: `src/lib/whatsapp/roletaDosAnuncios.ts`
- Create: `src/lib/whatsapp/planoDaRoleta.ts` (puro)
- Test: `src/lib/whatsapp/planoDaRoleta.test.ts`

**Interfaces:**
- Consumes: `proximo_da_roleta(..., p_modo)`, `enfileirar_aviso_do_lead` (Task 1).
- Produces:
  - `type ModoDaRoleta = "desligada" | "mensagem" | "grupo"`
  - `lerModoDaRoleta(corretorId: string): Promise<ModoDaRoleta>` (em `roletaDosAnuncios.ts`)
  - `planoDeMensagens(modo: Exclude<ModoDaRoleta,"desligada">, repassou: boolean): Array<"boas_vindas" | "passagem" | "abertura">` (puro)
  - `repassarPelaRoleta(params)` mantém a assinatura; passa a enviar as mensagens na ordem de `planoDeMensagens`, chamar `enfileirar_aviso_do_lead` depois de trocar o dono, e devolver `null` (sem avisar ninguém) se o `update` de `leads` falhar ou não afetar linha.

- [ ] **Step 1: Teste do plano**

```ts
// O que a ROLETA manda. No modo grupo a boas-vindas já saiu pelo webhook (Task 3).
expect(planoDeMensagens("mensagem", true)).toEqual(["passagem", "abertura"]);
expect(planoDeMensagens("mensagem", false)).toEqual(["boas_vindas"]);
expect(planoDeMensagens("grupo", true)).toEqual([]);
expect(planoDeMensagens("grupo", false)).toEqual([]);
```
No modo `mensagem`, TODO caminho que termina sem repasse (ninguém disponível, vez do próprio dono, erro do RPC, exceção pega no `try/catch` de `repassarPelaRoleta`) manda a boas-vindas do número do dono, grava na conversa do dono e devolve `null` — o cliente nunca fica sem resposta.
mais um teste de fonte: `roletaDosAnuncios.ts` chama `rpc("enfileirar_aviso_do_lead"` depois de `passarAFicha` e `passarAFicha` devolve `boolean` usado num `if`.

- [ ] **Step 2:** Rodar; FAIL.
- [ ] **Step 3:** Implementar. No modo `grupo`: sem abertura nem passagem; nenhuma mensagem do número do escolhido; a notificação no celular (`avisarCorretor`) continua. No modo `mensagem`, a passagem sai do número do dono ANTES da abertura; se a abertura falhar para todos, o dono manda a boas-vindas (`BOAS_VINDAS_DE_CAMPANHA`). `passarAFicha` passa a usar `.select("id")` e devolver se mudou.
- [ ] **Step 4:** PASS + `npx vitest run src/lib/whatsapp --exclude ".claude/**"`.
- [ ] **Step 5:** Commit `fix(roleta): ordem das mensagens, modo grupo e repasse só com ficha trocada`.

### Task 3: Webhook não manda a boas-vindas antes da roleta no modo mensagem

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (bloco ~879–950)
- Test: `src/app/api/webhooks/whatsapp/boasVindasDaRoleta.test.ts` (teste de fonte, padrão do projeto)

**Interfaces:**
- Consumes: `lerModoDaRoleta`, `repassarPelaRoleta` (Task 2).

- [ ] **Step 1:** Teste de fonte: o envio de `BOAS_VINDAS_DE_CAMPANHA` no webhook fica condicionado a `modoDaRoleta !== "mensagem" || !conversa.leadCriadoAgora`; a IA continua sendo calada (`calarIaNaConversaDeCampanha`) em todos os casos de anúncio.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Ler o modo uma vez (`lerModoDaRoleta(instancia.corretorId)`) antes do bloco do impulsionamento; no modo mensagem com lead novo, pular a boas-vindas (a roleta manda passagem ou boas-vindas). `vaiParaARoleta` passa a exigir `modo !== "desligada"`.
- [ ] **Step 4:** PASS + `npx vitest run src/app/api/webhooks --exclude ".claude/**"`.
- [ ] **Step 5:** Commit `fix(webhook): boas-vindas do anúncio não atropela a roleta`.

### Task 4: O envio para o grupo confere o dono atual

**Files:**
- Modify: `src/lib/crm/enviosDeLeadParaGrupo.ts`
- Test: `src/lib/crm/enviosDeLeadParaGrupo.test.ts`

**Interfaces:**
- Produces: `destinoDoAviso(item: { corretor_id: string; grupo_jid: string }, lead: { corretor_id: string | null; trazido_por: string; etapa: string } | null, donoAtual: { id: string; ativo: boolean; whatsapp_grupo_leads_jid: string | null } | null): { acao: "enviar"; corretorId: string; grupoJid: string } | { acao: "cancelar"; motivo: string }` (puro, exportado)

- [ ] **Step 1: Testes**

```ts
// dono mudou depois do enfileiramento → manda no grupo do dono atual
expect(destinoDoAviso({ corretor_id: "A", grupo_jid: "1@g.us" }, { corretor_id: "B", trazido_por: "imobiliaria", etapa: "novo" }, { id: "B", ativo: true, whatsapp_grupo_leads_jid: "2@g.us" }))
  .toEqual({ acao: "enviar", corretorId: "B", grupoJid: "2@g.us" });
// impulsionamento do próprio corretor → cancela
expect(destinoDoAviso(item, { ...lead, trazido_por: "corretor" }, dono).acao).toBe("cancelar");
// dono atual sem grupo / sem dono / perdido → cancela
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** No worker, ler `corretor_id, trazido_por, etapa` do lead e o dono atual; aplicar `destinoDoAviso`; `cancelar` grava `status = 'cancelado'` com `ultimo_erro = motivo`; `enviar` usa o corretor e o JID devolvidos e grava o `corretor_id`/`grupo_jid` efetivos na linha.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `fix(grupos): aviso do lead vai para o dono atual`.

### Task 5: Tela da roleta escolhe o modo

**Files:**
- Modify: `src/app/corretor/(painel)/marketing/impulsionamentos/{RoletaDosAnuncios.tsx,EditorDaRoleta.tsx,roletaAcoes.ts}`
- Test: `src/app/corretor/(painel)/marketing/impulsionamentos/roletaAcoes.test.ts`

**Interfaces:**
- `salvarRoleta(entrada & { modoAviso: "mensagem" | "grupo" })`; recusa `"grupo"` com "Peça ao gestor para ligar o envio de leads para os grupos." se `grupos.envio_grupo_leads_ativo` for falso.
- `ConfigDaRoleta` ganha `modoAviso`; `RoletaDosAnuncios` passa `grupoTemEnvio: boolean` e, para cada pessoa da equipe, `temGrupo: boolean` (no modo grupo a lista mostra "sem grupo" no lugar de "desconectado").

- [ ] **Step 1:** Teste da action (mock do `createServiceClient` no padrão dos testes de action vizinhos): salvar `grupo` sem envio ativo devolve o erro acima; com envio ativo grava `modo_aviso: "grupo"`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar; rótulos: "Mensagem do número do corretor" / "Aviso no grupo para o corretor ligar"; textos de passagem/abertura só aparecem no modo mensagem. **Step 4:** PASS + conferir a tela em 375px de largura.
- [ ] **Step 5:** Commit `feat(roleta): escolher aviso no grupo na tela`.

---

## Etapa 2 — Retorno da ligação pelo grupo

### Task 6: Teste real na Evolution, migration 0218 e vínculo do corretor no grupo

**Files:**
- Create: `supabase/migrations/0218_retorno_da_ligacao_pelo_grupo.sql`
- Create: `src/lib/whatsapp/participantesDoGrupo.ts` (puro: `ParticipanteDoGrupo`, parser da resposta da Evolution, `mesmoNumero`)
- Modify: `src/lib/whatsapp/provider.ts` (só `listarParticipantesDoGrupo`), `src/app/corretor/(painel)/admin/whatsapp/acoes.ts` (`sincronizarGruposDeLeadsDaAretz`), `src/lib/supabase/types.ts`, `src/lib/grupos/tabelasDoGrupo.ts`
- Test: `src/lib/whatsapp/participantesDoGrupo.test.ts`, `src/lib/crm/retornoPeloGrupo/migration.test.ts`

**Interfaces:**
- Produces (SQL):
  - `corretores.whatsapp_lid text` (único por grupo quando não nulo)
  - `lead_envios_grupo`: `tentativas_ligacao int not null default 0`, `retorno_em timestamptz` (preenchido no 1º resultado `atendeu`/`numero_errado`), `ultima_mensagem_avisada_em timestamptz`
  - tabela `retornos_de_ligacao` (`id`, `grupo_id`, `lead_id` null até resolver, `corretor_id`, `envio_id` → `lead_envios_grupo`, `mensagem_id text not null unique`, `confirmacao_mensagem_id text`, `texto text`, `audio_path text`, `resultado text check in ('atendeu','nao_atendeu','numero_errado','pediu_retorno')`, `leitura jsonb`, `status text check in ('aplicado','aguardando_escolha','sem_leitura','falhou')`, `opcoes uuid[]`, `corrige_id uuid` → self, `created_at`)
  - tabela `listas_de_retorno_enviadas (grupo_id, gestor_id, dia date, enviada_em, unique (gestor_id, dia))`
  - bucket privado `retornos-de-ligacao` (sem policy para anon/authenticated)
- Produces (TS):
  - `type ParticipanteDoGrupo = { id: string; numero: string | null }` (`numero` só dígitos)
  - `listarParticipantesDoGrupo(instanceName: string, grupoJid: string): Promise<{ participantes: ParticipanteDoGrupo[]; erro?: string }>` (Evolution `GET /group/participants/{instance}?groupJid=`; aceita `phoneNumber`/`jid` alternativo quando `id` é `@lid`)
  - `mesmoNumero(a: string, b: string): boolean` (só dígitos, com e sem 55, com e sem o 9 móvel)

- [ ] **Step 1 (com o dono):** no número central da Aretz, chamar `/group/participants` de um grupo e mandar uma mensagem de teste no grupo com o webhook logando o `data.key` e campos de participante (log temporário, removido no fim do passo). Anotar no fim deste arquivo o formato real (`participant`, `participantAlt`, `@lid`, `phoneNumber`). **Se nenhum campo trouxer o número e a lista também não, PARAR e voltar ao dono** (o anti-objetivo "gestor vira retorno" não teria proteção).
- [ ] **Step 2:** Testes: `mesmoNumero("5511987654321","11987654321")` true; `"551187654321"` vs `"5511987654321"` true; números diferentes false; parser de participantes com os formatos anotados no Step 1. Teste da migration (unique de `mensagem_id`, `revoke all`, policy restritiva).
- [ ] **Step 3:** FAIL. **Step 4:** Implementar. Na sincronização: recusar JID que caiu em dois corretores (nenhum dos dois é vinculado; mensagem: "O grupo X serve a mais de um corretor; renomeie para ter um grupo por corretor."); para cada grupo vinculado, ler participantes e gravar `whatsapp_lid` do participante cujo `numero` bate com `corretores.whatsapp`. Nunca gravar lid sem o par número↔lid.
- [ ] **Step 5:** PASS + `db:teste` + `isolamento.db.test.ts`. Commit `feat(grupos): vínculo do corretor no grupo e tabelas do retorno (0218)`.

### Task 7: Quem falou e de qual lead é (puro)

**Files:**
- Create: `src/lib/crm/retornoPeloGrupo/identificar.ts`
- Test: `src/lib/crm/retornoPeloGrupo/identificar.test.ts`

**Interfaces:**
- Produces:
  - `type MensagemDoGrupo = { grupoJid: string; mensagemId: string; autorIds: string[]; texto: string; ehAudio: boolean; citadaId: string | null; enviadaEm: Date }` e `lerMensagemDoGrupo(payload: unknown): MensagemDoGrupo | null` (`autorIds` = todos os ids de participante do payload, `citadaId` = `contextInfo.stanzaId`)
  - `reconhecerAutorNoGrupo(autorIds: string[], corretor: { whatsapp: string; whatsapp_lid: string | null }): boolean`
  - `type Aguardando = { envioId: string; leadId: string; nome: string | null; avisoMensagemId: string | null; corretorAtualId: string }`
  - `escolherLeadDoRetorno(p: { corretorId: string; citadaId: string | null; texto: string; aguardando: Aguardando[]; confirmacoes: Array<{ retornoId: string; mensagemId: string; leadId: string }>; perguntas: Array<{ retornoId: string; mensagemId: string; opcoes: string[] }> }): { tipo: "lead"; leadId: string; envioId: string | null } | { tipo: "correcao"; retornoId: string; leadId: string } | { tipo: "escolha"; retornoId: string; indice: number } | { tipo: "perguntar"; opcoes: Aguardando[] } | { tipo: "nao_e_mais_seu"; leadId: string } | { tipo: "nenhum" }`

- [ ] **Step 1: Testes** — um `it` por regra da spec 6.3, na ordem: citação de aviso; citação de confirmação → `correcao`; resposta "1"/"2" citando pergunta → `escolha`; um só aguardando → ele; vários + nome único no texto (sem acento/caixa) → ele; vários e ambíguo → `perguntar`; citação de aviso de lead cujo `corretorAtualId` ≠ autor → `nao_e_mais_seu`; nenhum aguardando e sem citação → `nenhum`. `reconhecerAutorNoGrupo`: número bate; lid bate; gestor (outro número) false; lista vazia false.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(retorno): reconhecer o corretor e o lead do retorno`.

### Task 8: Leitura do relato pela IA

**Files:**
- Create: `src/lib/crm/retornoPeloGrupo/ler.ts`, `src/lib/crm/retornoPeloGrupo/leituraDoRetorno.ts` (puro)
- Test: `src/lib/crm/retornoPeloGrupo/leituraDoRetorno.test.ts`

**Interfaces:**
- Produces:
  - `type LeituraDoRetorno = { resultado: "atendeu" | "nao_atendeu" | "numero_errado" | "pediu_retorno"; etapa: EtapaFunil | null; visitaEm: string | null /* ISO */; motivoPerda: string | null; resumo: string | null; proximoPasso: string | null; fatos: Partial<Pick<DossieClienteIA, "orcamentoMin" | "orcamentoMax" | "rendaMensal" | "regiaoInteresse" | "dormitoriosMin" | "formaPagamento" | "perfilFamiliar" | "urgenciaMudanca" | "exigenciasEspecificas" | "objecoesIdentificadas" | "temperaturaLabel">> }` (conferir os nomes exatos em `src/lib/whatsapp/types.ts` e usar os que existem)
  - `normalizarLeituraDoRetorno(json: unknown, agora: Date): LeituraDoRetorno | null`
  - `lerRetornoDaLigacao(p: { relato: string; fichaAtual: string; dossieAtual: string | null; agora: Date }): Promise<{ ok: true; leitura: LeituraDoRetorno; tokensEntrada: number | null; tokensSaida: number | null } | { ok: false }>` (usa `chamarLlmJson` com `temperature: 0.1`; o prompt recebe "agora" em `America/Sao_Paulo` com dia da semana e pede `visitaEm` em ISO com offset `-03:00`)

- [ ] **Step 1: Testes de `normalizarLeituraDoRetorno`** — etapa fora de `ETAPAS_FUNIL` vira `null`; `perdido` sem `motivoPerda` vira `etapa: null`; `visitaEm` no passado ou a mais de 60 dias de `agora` vira `null`; `visita_agendada` sem `visitaEm` vira `etapa: null`; `nao_atendeu` força `etapa: null`; resultado desconhecido → `null`; números negativos/zero viram ausentes.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(retorno): IA lê o relato da ligação`.

### Task 9: Aplicar o retorno e confirmar no grupo

**Files:**
- Create: `src/lib/crm/retornoPeloGrupo/aplicar.ts`, `src/lib/crm/retornoPeloGrupo/textos.ts` (puro), `src/lib/crm/retornoPeloGrupo/index.ts`
- Test: `src/lib/crm/retornoPeloGrupo/textos.test.ts`, `src/lib/crm/retornoPeloGrupo/aplicar.test.ts`

**Interfaces:**
- Consumes: Tasks 6–8; `salvarDossie`, `registrarInteracao` (`src/lib/crm/interacoes.ts`), `textoMudancaEtapa` (`src/lib/crm/timeline.ts`), `grupoSuspenso`, `transcreverAudioWhatsapp`, `baixarMidiaDoProvedor`, `enviarMensagemWhatsappParaGrupo`.
- Produces:
  - `tratarMensagemDoGrupoDeLeads(p: { payload: unknown; instanceName: string; jidBruto: string }): Promise<{ tratada: boolean }>` em `index.ts` — `tratada: false` quando o grupo/instância não é de leads (o webhook então segue descartando como hoje). Nunca lança.
  - `textoDaConfirmacao(p: { nome: string; leitura: LeituraDoRetorno; tentativa: number }): string`, `textoDaPergunta(nomes: string[]): string`, `TEXTO_AUDIO_NAO_ENTENDIDO`, `TEXTO_SEM_LEITURA(nome)`, `TEXTO_NAO_E_MAIS_SEU(nome)`.

- [ ] **Step 1: Testes de texto** — `atendeu` + visita sáb 01/11 10h + 3 quartos + 600 mil + FGTS → `"✅ Ana · visita agendada sáb 01/11 10h · 3 quartos · até R$ 600 mil · FGTS"`; `nao_atendeu` tentativa 2 → `"📞 Ana · não atendeu (2ª tentativa)"`; pergunta → `"Esse retorno é sobre: 1) Ana 2) Paulo? Responda em cima desta mensagem com o número."`; `TEXTO_AUDIO_NAO_ENTENDIDO` = `"Não consegui entender o áudio, pode mandar de novo?"`.
- [ ] **Step 2: Testes de `aplicar`** (cliente Supabase falso no padrão de `src/lib/crm/*.test.ts`): mesma `mensagem_id` duas vezes → um insert só (o segundo cai no `unique` e sai sem responder); grupo suspenso → grava `ligacao` com texto bruto, `status 'sem_leitura'`, não chama a IA nem muda etapa; `nao_atendeu` incrementa `tentativas_ligacao` e não mexe em `retorno_em`; `atendeu` preenche `retorno_em`; correção sobrescreve etapa/visita do retorno corrigido e grava nova linha `ligacao` com `corrige_id`.
- [ ] **Step 3:** FAIL. **Step 4:** Implementar `aplicar.ts`: insert em `retornos_de_ligacao` primeiro (idempotência); áudio → `baixarMidiaDoProvedor` → upload em `retornos-de-ligacao/<grupo>/<lead>/<mensagemId>.ogg` → transcrever; falhou → `TEXTO_AUDIO_NAO_ENTENDIDO`, `status 'falhou'`; etapa via service client com `.eq("grupo_id")` + linha `etapa` com `textoMudancaEtapa`; visita em `leads.visita_agendada_em`; perda: etapa `perdido` + motivo em `detalhes.motivo_perda`; dossiê via `salvarDossie` montado sobre o dossiê atual; linha `ligacao` com `detalhes: { origem: "grupo_whatsapp", resultado, mensagem_id, audio_path }`; telemetria de custo em `ia_interacoes` com `acao` que NÃO seja `respondida`/`visita_confirmada` (conferir o `check` de `acao`/`origem` e ampliar na 0218 se preciso) — não conferir cota nem limite do plano.
- [ ] **Step 5:** Na ficha do lead (componente que desenha `lead_interacoes` em `src/app/corretor/(painel)/leads/[id]/`), a linha `ligacao` com `detalhes.audio_path` mostra o texto e um player (URL assinada de 1 h, gerada no servidor, só para quem enxerga o lead). LGPD: o prefixo `retornos-de-ligacao/<grupo>/` entra na rotina de exclusão do grupo da fase Op (procurar `APAGAR_GRUPOS_CANCELADOS`) e o de `<grupo>/<lead>/` na exclusão do lead; teste de fonte para as duas.
- [ ] **Step 6:** PASS. Commit `feat(retorno): aplicar o retorno da ligação e confirmar no grupo`.

### Task 10: Webhook abre a exceção estreita para o grupo de leads

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (~linha 271, o `if` que descarta `@g.us`)
- Test: `src/app/api/webhooks/whatsapp/grupoDeLeads.test.ts` (teste de fonte)

- [ ] **Step 1:** Teste de fonte: dentro do `if (/@(g\.us|broadcast)$/ ...)` o único caminho novo é `await tratarMensagemDoGrupoDeLeads(...)`, seguido do mesmo `return NextResponse.json({ ok: true, ignored: ... })` quando `tratada` é falso; nenhuma chamada a `decidirSeAIaResponde`/motor antes desse `return`. Mensagem `fromMe` do grupo (a confirmação do próprio número central) é ignorada antes de chamar.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. `tratarMensagemDoGrupoDeLeads` confere instância = `grupos.envio_grupo_leads_instancia` e JID = `whatsapp_grupo_leads_jid` de corretor ativo do mesmo grupo antes de qualquer outra leitura. **Step 4:** PASS + `npx vitest run src/app/api/webhooks --exclude ".claude/**"`.
- [ ] **Step 5:** Commit `feat(webhook): retorno da ligação pelo grupo do corretor`.

### Task 11: Mensagem do cliente avisa o grupo do corretor

**Files:**
- Create: `src/lib/crm/retornoPeloGrupo/mensagemDoCliente.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (depois de gravar a mensagem do cliente)
- Test: `src/lib/crm/retornoPeloGrupo/mensagemDoCliente.test.ts`

**Interfaces:**
- Produces: `textoDoAvisoDeMensagem(nome: string | null, textos: string[], teveAudio: boolean): string` (puro) e `avisarMensagemDoClienteNoGrupo(p: { grupoId: string; leadId: string; conversaId: string; mensagemId: string }): Promise<void>`.

- [ ] **Step 1: Testes** — `textoDoAvisoDeMensagem("Ana", ["ok, quando vão me ligar?"], false)` → `'💬 Ana mandou mensagem: "ok, quando vão me ligar?"'`; várias → uma linha por mensagem, até 5, depois "…e mais N"; áudio → `"💬 Ana mandou um áudio"` + transcrição se houver.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. Disparado em `after()` só quando o lead tem linha em `lead_envios_grupo` enviada e o dono atual ≠ `instancia.corretorId`. Agrupamento da rajada: espera 8 s, lê as mensagens do cliente da conversa depois de `ultima_mensagem_avisada_em`; só segue quem tiver a mensagem mais nova; reserva por update condicional de `ultima_mensagem_avisada_em`. Manda pelo número central no JID do dono atual. A IA continua calada (não mexer em `decidirSeAIaResponde`).
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(grupos): mensagem do cliente avisa o corretor no grupo`.

---

## Etapa 3 — Lista diária do gestor

### Task 12: Leads sem retorno às 18h

**Files:**
- Create: `src/lib/crm/leadsSemRetorno.ts`
- Modify: `src/app/api/cron/followups/route.ts` (junto de `enviarLeadsDistribuidosParaGrupos`)
- Test: `src/lib/crm/leadsSemRetorno.test.ts`

**Interfaces:**
- Produces:
  - `ehHoraDaLista(agora: Date): boolean` (true de 18:00 a 18:59 em `America/Sao_Paulo`)
  - `textoDaListaSemRetorno(itens: Array<{ corretor: string; cliente: string | null; avisadoEm: Date; tentativas: number }>, agora: Date): string | null` (`null` se vazio)
  - `enviarListasSemRetorno(supabase, agora = new Date()): Promise<number>`

- [ ] **Step 1: Testes** — `ehHoraDaLista` 17:59 false, 18:00 true, 18:59 true, 19:00 false (horário de SP, datas em UTC no teste); texto agrupado por corretor em ordem alfabética, cliente sem nome vira "Cliente novo", "há 5 h"/"há 2 dias", "2 tentativas"; lista vazia → `null`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. Consulta: `lead_envios_grupo` com `status = 'enviado'`, `retorno_em is null`, `enviado_em < agora - 3h`, lead ainda do `corretor_id` da linha, `trazido_por <> 'corretor'`, etapa fora de `perdido`/`fechado`; grupos com envio ativo. Para cada gestor ativo (`papel = 'gestor'`, não oculto) do grupo: reserva `listas_de_retorno_enviadas (gestor_id, dia)` por insert (conflito = já mandou) e envia por `enviarMensagemWhatsapp` no número central para `corretores.whatsapp` do gestor. Título: `"📋 Leads sem retorno de ligação (hoje, 18h)"`.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(gestor): lista diária de leads sem retorno`.

### Task 13: Fechar a tarefa

**Files:** `vault/10-notas/` (nota nova `retorno-da-ligacao-pelo-grupo.md` + atualizar `roleta-dos-anuncios.md` e `leads-distribuidos-nos-grupos-da-aretz.md`), `vault/20-mocs/MOC — CRM e Painel.md`, `vault/30-arquitetura/fluxo-do-webhook-whatsapp.md` (a exceção do `@g.us`), `docs/MEMORIA.md` (seção curta no fim), `docs/HANDOFF-MULTI-GRUPO.md` (0217 e 0218 antes do deploy; o que configurar).

- [ ] **Step 1:** Seguir a skill local `fechar-tarefa`.
- [ ] **Step 2:** `npx vitest run --exclude ".claude/**"` inteiro e `npx tsc --noEmit -p .`; anotar resultado.
- [ ] **Step 3:** Commit `docs: vault, memória e handoff do retorno pelo grupo`.

---

## Formato real da Evolution (preencher na Task 6, Step 1)

(vazio até o teste)
