# Financeiro Fase A — Fundação do dado: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comissão em parcelas, três datas por lançamento, repasse × direto, imposto pelo regime de apuração, distrato que não apaga o passado (só gestor) e parâmetros fiscais nacionais versionados.

**Architecture:** As contas ficam em módulos puros de `src/lib/financeiro/` (testados com vitest, sem banco), e a camada `*Dados.ts` só lê e monta. Uma migration (0232) cria `venda_parcelas` e `parametros_fiscais`, acrescenta colunas, migra cada venda para uma parcela e troca as permissões. O que é só do gestor é garantido no banco: grant por coluna, `security definer` com `eh_gestor()` e gatilho.

**Tech Stack:** Next.js (versão do repo; ler `node_modules/next/dist/docs/` antes de mexer em página/rota), Supabase Postgres + RLS, TypeScript, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-29-financeiro-fase-a-fundacao-design.md`

## Global Constraints

- Migration nova: `supabase/migrations/0232_financeiro_fase_a.sql`. Comentário de topo no estilo das 0114/0166 (data 29/10/2026, decisões numeradas), bloco `-- Reversão:` no fim.
- Toda tabela nova com `grupo_id` segue o molde de `0226_reunioes_e_bloqueios.sql` (linhas 27–110): coluna `grupo_id uuid not null references public.grupos(id) on delete cascade`, policy restritiva `isolamento_por_grupo`, gatilhos `carimbar_grupo` / `conferir_grupo_final`. Exceção: `parametros_fiscais` é da plataforma, sem `grupo_id`.
- Toda função `security definer` nova menciona `grupo_atual()` no corpo (guarda `src/lib/grupos/funcoesSeguras.test.ts`), começa com `if not public.eh_gestor() then raise exception 'so_gestor'` quando for de gestor, tem `set search_path = ''` e `revoke all ... from public, anon` + `grant execute ... to authenticated`.
- Dinheiro: `numeric(14,2)` no banco; no TS, toda soma passa por `centavos()` de `src/lib/financeiro/venda.ts`.
- Valores fixados pelo spec: teto INSS 2026 = `8475.55` (Portaria Interministerial 13/2026); teto até 2025 = `8157.41`; redutor Lei 15.270/2025 = isento até `5000`, fórmula `978.62 - 0.133145 × rendimento` até `7350`; INSS autônomo `0.11`; patronal `0.20` (só fora do Simples); desconto simplificado `607.20`; faixas do IRRF de `fiscal.ts` (vigentes desde 05/2025).
- Padrões: `forma_recebimento = 'repasse'`; `regime_apuracao = 'competencia'`; competência da comissão = `data_venda`.
- Toda escrita que toca dinheiro em data de mês fechado passa por `mesFechadoEntre([...])` e devolve `recusaDeMesFechado(mes)` (`src/lib/financeiro/mesFechado.ts`).
- Texto de tela em pt-BR, no tom das telas existentes. Fiscal sem `conferido_em` mostra "Estimativa — confira com seu contador".
- Painel mobile-first: registrar venda de 1 parcela, todos `repasse`, não ganha toque novo.
- Rodar a suíte: `npm test` (vitest). Banco local para `.db.test`: `npm run db:teste` e depois `npm run test:isolamento`.

## Review Focus

1. **Venda antiga com comissão recebida e depois distratada** (existe em produção?): a migração precisa dar 1 parcela recebida, não cancelada, e o caixa/resultado do mês do recebimento não pode mudar. Teste no Task 5 (SQL) e no Task 4 (movimentos).
2. **Gestor edita uma venda que já tem parcela recebida**: `salvar_venda` não pode apagar parcela recebida nem a data dela. Esperado: erro `parcela_ja_recebida` e nada muda. Teste no Task 6.
3. **Corretor reenviando o formulário de uma venda em que o gestor marcou `direto`**: a marca não pode voltar para `repasse` em silêncio. Esperado: `salvar_venda` mantém a forma gravada quando o payload não traz a chave. Teste no Task 6.
4. **Dois RPAs do mesmo corretor no mesmo mês, um em dezembro/2025 e outro em janeiro/2026**: cada um usa os parâmetros da sua data, e o acumulado do mês não cruza a virada. Teste no Task 1.
5. **Parcelas cujos centavos não fecham** (comissão R$ 10.000,00 em 3): a divisão automática fecha ao centavo, e a validação recusa uma soma que difere em mais de R$ 0,01. Teste no Task 2.

---

### Task 1: Parâmetros fiscais versionados (puro)

**Files:**
- Create: `src/lib/financeiro/parametrosFiscais.ts`
- Create: `src/lib/financeiro/parametrosFiscais.test.ts`
- Modify: `src/lib/financeiro/fiscal.ts` (remover `FAIXAS_IRRF`, `DESCONTO_SIMPLIFICADO` e as constantes do `reducaoDoIrrf`; `ConfigFiscal` perde `tetoInss` e ganha `regimeApuracao`)
- Modify: `src/lib/financeiro/fiscal.test.ts`

**Interfaces:**
- Produces:
  - `type ChaveFiscal = "irrf_faixas" | "irrf_desconto_simplificado" | "irrf_redutor" | "inss_teto" | "inss_autonomo" | "inss_patronal"`
  - `type LinhaDeParametro = { chave: ChaveFiscal; vigenteDesde: string; valor: unknown; fonte: string; fonteUrl: string | null }`
  - `type ParametrosFiscais = { faixasIrrf: { ate: number; aliquota: number; deducao: number }[]; descontoSimplificado: number; redutor: { isentoAte: number; ate: number; a: number; b: number } | null; tetoInss: number; inssAutonomo: number; inssPatronal: number; origem: { chave: ChaveFiscal; vigenteDesde: string; fonte: string; fonteUrl: string | null }[] }`
  - `LINHAS_PADRAO: LinhaDeParametro[]` — as mesmas linhas do seed do Task 5 (fallback "sem_tabela")
  - `parametrosNaData(linhas: LinhaDeParametro[], data: string): ParametrosFiscais` — para cada chave, a linha com o maior `vigenteDesde <= data`; lança `Error("parametro_fiscal_ausente:<chave>")` se faltar
  - `fiscal.ts`: `type RegimeApuracao = "competencia" | "caixa"`; `ConfigFiscal = { regime; regimeApuracao: RegimeApuracao; aliquotaSimples; aliquotaIss; cnpj; razaoSocial; conferidoEm }`
  - `fiscal.ts`: `reducaoDoIrrf(rendimento: number, imposto: number, p: ParametrosFiscais): number`; `irrfDaTabela(base: number, p: ParametrosFiscais): number`; `calcularRpa(bruto: number, config: ConfigFiscal, p: ParametrosFiscais, jaPagoNoMes = 0): Rpa`

- [ ] **Step 1: Testes que falham** em `parametrosFiscais.test.ts`:
  - `parametrosNaData(LINHAS_PADRAO, "2025-12-15").tetoInss === 8157.41` e `.redutor === null`
  - `parametrosNaData(LINHAS_PADRAO, "2026-01-01").tetoInss === 8475.55` e `.redutor` igual a `{ isentoAte: 5000, ate: 7350, a: 978.62, b: 0.133145 }`
  - `parametrosNaData(LINHAS_PADRAO, "2026-03-10").faixasIrrf` igual às 5 faixas atuais de `fiscal.ts`
  - linhas sem `inss_teto` → `toThrow("parametro_fiscal_ausente:inss_teto")`
  - cada entrada de `.origem` tem `fonte` não vazia
- [ ] **Step 2:** `npx vitest run src/lib/financeiro/parametrosFiscais.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `parametrosFiscais.ts`. As linhas de 2025-05-01 levam as faixas, o desconto de 607.20, o teto de 8157.41, `inss_autonomo` 0.11, `inss_patronal` 0.20 e `irrf_redutor` `null`. As de 2026-01-01 levam `inss_teto` 8475.55 (fonte "Portaria Interministerial MPS/MF 13/2026") e `irrf_redutor` (fonte "Lei 15.270/2025"). Fonte das faixas: "Tabela progressiva mensal do IRRF (MP 1.294/2025)".
- [ ] **Step 4: Testes que falham** em `fiscal.test.ts`, trocando os que usam `CONFIG_PADRAO.tetoInss`:
  - `calcularRpa(10000, CONFIG_PADRAO, parametrosNaData(LINHAS_PADRAO, "2026-02-01")).inss === centavos(8475.55 * 0.11)`
  - mesmo valor com parâmetros de "2025-11-01" → `inss === centavos(8157.41 * 0.11)`
  - `calcularRpa(4800, ..., params2026).irrf === 0` (redutor)
  - Review Focus 4: `calcularRpa(3000, cfg, params2026, 3000)` usa só os parâmetros de 2026; quem chama não soma pagamento de outro mês (o teste documenta a assinatura: `jaPagoNoMes` é do mesmo mês da data dos parâmetros)
  - regime `presumido` → `inssPatronal === centavos(bruto * 0.20)`; `simples` → 0
- [ ] **Step 5:** Ajustar `fiscal.ts` às assinaturas acima, tirar `tetoInss` de `CONFIG_PADRAO` e pôr `regimeApuracao: "competencia"`. Corrigir os chamadores apontados por `npx tsc --noEmit` (o `fiscalDoMes.ts` é reescrito no Task 7; aqui, só passar `parametrosNaData(LINHAS_PADRAO, pagoEm)`).
- [ ] **Step 6:** `npx vitest run src/lib/financeiro` → PASS; `npx tsc --noEmit` → sem erro.
- [ ] **Step 7: Commit** `feat(financeiro): parâmetros fiscais nacionais com vigência e fonte`

---

### Task 2: Parcelas de comissão e forma de recebimento (puro)

**Files:**
- Create: `src/lib/financeiro/parcelas.ts`
- Create: `src/lib/financeiro/parcelas.test.ts`

**Interfaces:**
- Produces:
  - `type Pagador = "construtora" | "comprador"`
  - `type FormaRecebimento = "repasse" | "direto"`
  - `type Parcela = { id: string; numero: number; valor: number; pagador: Pagador; venceEm: string | null; recebidaEm: string | null; canceladaEm: string | null }`
  - `type ParcelaNova = Omit<Parcela, "id" | "recebidaEm" | "canceladaEm">`
  - `type SituacaoDaParcela = "recebida" | "cancelada" | "atrasada" | "prevista" | "sem_data"`
  - `MAX_PARCELAS = 24`
  - `valorDaImobiliaria(comissaoValor: number, participantes: { formaRecebimento: FormaRecebimento; repasseValor: number }[]): number`
  - `dividirEmParcelas(total: number, n: number, primeiroVencimento: string | null, pagador: Pagador): ParcelaNova[]` — vencimentos mensais a partir do primeiro (usar `somarMeses` de `caixa.ts`); o resto dos centavos vai na 1ª
  - `validarParcelas(parcelas: { valor: number }[], esperado: number): string[]` — mensagens de erro em pt-BR, `[]` se ok
  - `situacaoDaParcela(p: Parcela, hoje: string): SituacaoDaParcela`
  - `somaDas(parcelas: Parcela[], filtro: "todas" | "recebidas" | "abertas" | "nao_canceladas"): number`
  - `repasseDevido(repasseValor: number, parcelas: Parcela[]): number` = repasse × não canceladas ÷ todas
  - `repasseLiberado(repasseValor: number, parcelas: Parcela[]): number` = repasse × recebidas ÷ todas
  - `fatiasDoRepasse(repasseValor: number, parcelas: Parcela[]): { parcelaId: string; valor: number; data: string | null }[]` — uma fatia por parcela não cancelada, `data = recebidaEm ?? venceEm`, resto dos centavos na última; soma = `repasseDevido`

- [ ] **Step 1: Testes que falham**:
  - `valorDaImobiliaria(10000, [{formaRecebimento:"repasse",repasseValor:4000},{formaRecebimento:"direto",repasseValor:3000}]) === 7000`
  - Review Focus 5: `dividirEmParcelas(10000, 3, "2026-11-10", "construtora")` → valores `[3333.34, 3333.33, 3333.33]`, vencimentos `2026-11-10`, `2026-12-10`, `2027-01-10`
  - `validarParcelas([{valor:5000},{valor:4999.98}], 10000)` não vazio; `validarParcelas([{valor:5000},{valor:4999.99}], 10000)` vazio (tolerância de 0,01); 25 parcelas → erro; valor 0 → erro
  - `situacaoDaParcela` cobre as 5 situações (atrasada = `venceEm < hoje` sem recebida/cancelada)
  - 3 parcelas de 1000, 1 recebida, 1 cancelada: `repasseDevido(600, p) === 400`, `repasseLiberado(600, p) === 200`
  - `fatiasDoRepasse(1000, 3 parcelas iguais abertas)` soma 1000 e tem 3 fatias
- [ ] **Step 2:** `npx vitest run src/lib/financeiro/parcelas.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `parcelas.ts` com as assinaturas acima.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(financeiro): parcelas de comissão e forma de recebimento`

---

### Task 3: Receita-base do imposto por regime de apuração (puro)

**Files:**
- Create: `src/lib/financeiro/receitaBase.ts`
- Create: `src/lib/financeiro/receitaBase.test.ts`

**Interfaces:**
- Consumes: `Parcela`, `FormaRecebimento`, `valorDaImobiliaria`, `somaDas` (Task 2); `RegimeApuracao` (Task 1)
- Produces:
  - `type VendaParaReceita = { id: string; status: "ativa" | "distratada"; dataVenda: string; comissaoValor: number; participantes: { formaRecebimento: FormaRecebimento; repasseValor: number }[]; parcelas: Parcela[] }`
  - `type AvulsaParaReceita = { valor: number; competencia: string; pagoEm: string | null }` (lançamento `comissao_avulsa` do caixa; `competencia` = "aaaa-mm-01")
  - `type ReceitaBase = { comissoes: number; avulsas: number; ajustesDeDistrato: number; total: number; regime: RegimeApuracao }`
  - `receitaBaseDoMes(vendas: VendaParaReceita[], avulsas: AvulsaParaReceita[], mes: string, regime: RegimeApuracao): ReceitaBase`

  Regras do spec:
  - competência: `comissoes` = Σ `valorDaImobiliaria` das vendas com `dataVenda` no mês, distratadas inclusive (o fato aconteceu); `ajustesDeDistrato` = −Σ parcelas com `canceladaEm` no mês; `avulsas` pela `competencia`
  - caixa: `comissoes` = Σ parcelas com `recebidaEm` no mês; `ajustesDeDistrato = 0`; `avulsas` por `pagoEm`

- [ ] **Step 1: Testes que falham**:
  - todos `repasse`, comissão 10000, venda em 2026-03: competência de março → `total 10000` (é o comportamento de hoje)
  - com um `direto` de 3000 → `comissoes 7000`
  - venda em março, 2 parcelas de 5000, distratada em junho com a 2ª cancelada em 2026-06-20: março `+10000`; junho `ajustesDeDistrato -5000`; março não muda
  - regime caixa: parcela recebida em abril → abril `comissoes 5000`, março `0`
  - avulsa com competência 2026-03-01 e pagamento em 2026-04-05: competência conta em março, caixa conta em abril
- [ ] **Step 2:** `npx vitest run src/lib/financeiro/receitaBase.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(financeiro): receita-base do imposto por competência ou caixa`

---

### Task 4: Caixa, extrato, previsão e alertas leem parcelas; distrato preserva o pago (puro)

**Files:**
- Modify: `src/lib/financeiro/caixa.ts` (`VendaDoCaixa`, `movimentosDo`, `LancamentoDoCaixa` ganha `competencia: string | null`)
- Modify: `src/lib/financeiro/caixa.test.ts`
- Modify: `src/lib/financeiro/extrato.ts` (+ `.test` se houver; senão criar `extrato.test.ts`)
- Modify: `src/lib/financeiro/previsao.ts`
- Modify: `src/lib/financeiro/alertas.ts`, `src/lib/financeiro/alertas.test.ts`

**Interfaces:**
- Consumes: Task 2 inteira
- Produces:
  - `VendaDoCaixa = { id; imovel; unidade; construtora; status: "ativa" | "distratada"; parcelas: Parcela[]; participantes: { corretorId; nome; repasseValor; repassePagoEm: string | null; formaRecebimento: FormaRecebimento }[] }` (saem `comissaoValor`, `comissaoPrevistaEm`, `comissaoRecebidaEm`)
  - chaves de movimento: parcela `p:${parcela.id}`; repasse pago `r:${venda}:${corretor}`; fatia de repasse em aberto `r:${venda}:${corretor}:${parcelaId}`
  - `competenciaDoLancamento(l: LancamentoDoCaixa): string` = `l.competencia ?? l.vencimento.slice(0,7)+"-01"`
  - `extrato.ts`: `ParticipanteDoExtrato` ganha `formaRecebimento`; `VendaDoExtrato` troca `comissaoRecebidaEm` por `parcelas: Parcela[]`; `SituacaoDoRepasse` ganha `"recebe_direto"` e `"parcial"`; a linha do extrato ganha `liberado: number` (= `repasseLiberado`)
  - `EntradaDosAlertas` ganha `distratosAvisados: { vendaId: string; imovel: string; avisadoEm: string }[]` → alerta `id: "distrato_avisado"`, gravidade `"alerta"`, `href: /corretor/financeiro/${vendaId}` (um alerta por venda)

  Regras de `movimentosDo`:
  - não pula mais a venda distratada
  - entrada por parcela não cancelada: `vencimento = venceEm`, `pagoEm = recebidaEm`
  - participante `direto` não gera repasse
  - participante `repasse` com `repassePagoEm`: um movimento só, valor cheio `repasseValor`, pago na data
  - sem `repassePagoEm`: as fatias de `fatiasDoRepasse`, com `pagoEm` null

- [ ] **Step 1: Testes que falham** em `caixa.test.ts`:
  - Review Focus 1: venda distratada, parcela única recebida em 2026-03-10 e repasse pago em 2026-03-15 → `resultadoDoMes(movimentos, "2026-03")` com `comissoes` = valor e `repasses` = repasse
  - distratada com "cancelar": parcelas canceladas não aparecem; com "manter": aparecem pendentes
  - 3 parcelas, 1 recebida → 1 entrada paga e 2 pendentes com os vencimentos próprios
  - participante `direto` → nenhum movimento `r:`
  - repasse em aberto com 1 de 3 parcelas cancelada → soma das fatias = 2/3 do repasse
- [ ] **Step 2: Testes que falham** em extrato e alertas: `situacaoDoRepasse` dá `"recebe_direto"` para `direto` e `"parcial"` com parte recebida; `liberado` proporcional; `alertasDoFinanceiro` com `distratosAvisados` de 1 item → um alerta `distrato_avisado`.
- [ ] **Step 3:** `npx vitest run src/lib/financeiro` → FAIL nos novos.
- [ ] **Step 4:** Implementar. `previsao.ts`: o "certo" passa a ser a soma das parcelas abertas não canceladas de vendas ativas ou distratadas com "manter".
- [ ] **Step 5:** `npx vitest run src/lib/financeiro` → PASS. (`tsc` ainda falha nos leitores; fecha no Task 7.)
- [ ] **Step 6: Commit** `feat(financeiro): caixa e extrato por parcela; distrato não apaga o que já foi pago`

---

### Task 5: Migration 0232 e guardas estáticas

**Files:**
- Create: `supabase/migrations/0232_financeiro_fase_a.sql`
- Create: `src/lib/financeiro/faseA.migration.test.ts`
- Modify: `src/lib/financeiro/vendasSeguras.test.ts`
- Modify: `src/lib/supabase/types.ts` (à mão, no formato das tabelas vizinhas)
- Modify: `src/lib/grupos/funcoesSeguras.ts` (ou onde morar `FUNCOES_SEM_GRUPO`) **só se** a guarda pedir

Antes: `grep -n -i "venda_participantes\|grant por coluna\|recurs" docs/MEMORIA.md` e ler as seções que casarem.

**Interfaces (nomes que os Tasks 6–9 usam):**
- `venda_parcelas(id uuid pk default gen_random_uuid(), grupo_id, venda_id uuid not null references vendas on delete cascade, numero smallint not null check (numero between 1 and 24), valor numeric(14,2) not null check (valor > 0), pagador text not null default 'construtora' check (pagador in ('construtora','comprador')), vence_em date, recebida_em date, cancelada_em date, created_at timestamptz, atualizado_em timestamptz, unique (venda_id, numero), check (recebida_em is null or cancelada_em is null))`
- `venda_participantes.forma_recebimento text not null default 'repasse' check (forma_recebimento in ('repasse','direto'))`
- `vendas`: `+ distrato_motivo text check (length <= 500)`, `+ distrato_parcelas text check (distrato_parcelas in ('manter','cancelar'))`, `+ distrato_avisado_em timestamptz`, `+ distrato_aviso text check (length <= 500)`; constraint `vendas_distrato_decidido check (status = 'ativa' or (distrato_motivo is not null and distrato_parcelas is not null))`; `- comissao_prevista_em`, `- comissao_recebida_em` (depois do backfill)
- `caixa_lancamentos.competencia date check (competencia is null or extract(day from competencia) = 1)`
- `fiscal_config.regime_apuracao text not null default 'competencia' check (... in ('competencia','caixa'))`; `- teto_inss`
- `parametros_fiscais(chave text not null, vigente_desde date not null, valor jsonb not null, fonte text not null, fonte_url text, primary key (chave, vigente_desde))`: RLS ligada, policy de select `to authenticated using (true)`, `revoke all from anon`, só `grant select` para authenticated; seed = `LINHAS_PADRAO` do Task 1
- Funções (`security definer`, gestor, com grupo):
  - `marcar_parcela_recebida(p_parcela uuid, p_data date) returns boolean` — recusa `parcela_cancelada`
  - `distratar_venda(p_venda uuid, p_data date, p_motivo text, p_parcelas text) returns boolean` — exige motivo não vazio e `p_parcelas in ('manter','cancelar')`; com 'cancelar', `cancelada_em = p_data` nas parcelas sem `recebida_em` e sem `cancelada_em`
  - `desfazer_distrato(p_venda uuid) returns boolean` — volta para `ativa`, limpa os campos de distrato e reabre as parcelas com `cancelada_em = distratada_em` antiga
  - `avisar_distrato(p_venda uuid, p_texto text) returns boolean` — `security definer`, NÃO é de gestor: exige que quem chama tenha registrado ou participe (`participa_da_venda`), venda `ativa`; grava `distrato_avisado_em = now()` e `distrato_aviso`
  - `drop function public.marcar_comissao_recebida(uuid, date)`
- Funções auxiliares (`security definer`, `stable`): `venda_tem_parcela_recebida(p_venda uuid) returns boolean`. As policies de `vendas` e `venda_participantes` que liam `comissao_recebida_em is null` passam a usar `not public.venda_tem_parcela_recebida(id)` (função, não subconsulta, para não criar recursão de RLS: a lição da `participa_da_venda`). Só essas policies (0114) e `marcar_comissao_recebida` (0192) dependem das colunas antigas (grep feito em 29/10). Dropar e recriar as policies ANTES do `drop column`, senão o Postgres recusa.
- Gatilho `venda_participantes_forma_so_gestor` (before insert or update of `forma_recebimento`): se `new.forma_recebimento <> coalesce(old.forma_recebimento, 'repasse')` e não `eh_gestor()` → `raise exception 'so_gestor'`
- Grants (refazer com `revoke all ... from authenticated` antes, como a 0116):
  - `vendas`: `grant insert/update (...)` **sem** `status`, `distratada_em`, `distrato_*` e sem colunas de data de recebimento
  - `venda_participantes`: insert/update incluem `forma_recebimento` (o gatilho guarda)
  - `venda_parcelas`: `grant select, delete`; `insert (venda_id, numero, valor, pagador, vence_em)`; `update (valor, pagador, vence_em)`; nunca `recebida_em`/`cancelada_em`
- Backfill, nesta ordem e antes do drop: para cada venda com `comissao_valor > 0`, uma parcela `numero 1`, `valor = comissao_valor`, `vence_em = comissao_prevista_em`, `recebida_em = comissao_recebida_em`, `cancelada_em = case when status = 'distratada' and comissao_recebida_em is null then distratada_em end`, mesmo `grupo_id` da venda. Vendas já distratadas: `distrato_motivo = 'Registrado antes da 0232'`, `distrato_parcelas = 'cancelar'` (repete o que a tela mostra hoje). `caixa_lancamentos.competencia = date_trunc('month', vencimento)`.
- `salvar_venda` vira `salvar_venda(p_venda uuid, p_dados jsonb, p_participantes jsonb, p_parcelas jsonb)` e a versão de 3 parâmetros é removida. A regra está no Task 6, mas o SQL fica nesta migration.

- [ ] **Step 1: Testes que falham** em `faseA.migration.test.ts`, lendo a 0232 sem comentários, no estilo de `vendasSeguras.test.ts`:
  - o insert em `venda_parcelas ... select ... from public.vendas` aparece **antes** de `drop column comissao_recebida_em`
  - `parametros_fiscais` tem `revoke all ... from anon` e nenhum grant de insert/update/delete para authenticated
  - as 4 funções existem, são `security definer` e mencionam `grupo_atual()`; as três de gestor conferem `eh_gestor()`
  - o gatilho de `forma_recebimento` existe e confere `eh_gestor()`
  - `drop function public.marcar_comissao_recebida`
- [ ] **Step 2:** Em `vendasSeguras.test.ts`, contar só os grants **depois** do último `revoke all on public.<tabela> from authenticated` (helper `grantsVigentes(sql, tabela)`), e acrescentar:
  - nenhum grant vigente de insert/update em `vendas` inclui `status|distratada_em|distrato_`
  - nenhum grant em `venda_parcelas` inclui `recebida_em|cancelada_em`
  - guarda de leitor: nenhum arquivo em `src/` fora de `supabase/types.ts` e dos testes contém `comissao_recebida_em|comissao_prevista_em|comissaoRecebidaEm|comissaoPrevistaEm` (vai falhar até o Task 7; marcar `it.todo` aqui e virar `it` no Task 7)
- [ ] **Step 3:** `npx vitest run src/lib/financeiro/faseA.migration.test.ts src/lib/financeiro/vendasSeguras.test.ts src/lib/grupos/funcoesSeguras.test.ts src/lib/tabelasSeguras.test.ts` → FAIL.
- [ ] **Step 4:** Escrever a 0232 e atualizar `types.ts`.
- [ ] **Step 5:** O mesmo comando → PASS.
- [ ] **Step 6: Commit** `feat(banco): 0232 parcelas de comissão, distrato do gestor e parâmetros fiscais`

---

### Task 6: `salvar_venda` com parcelas e permissões no banco de teste

**Files:**
- Modify: `supabase/migrations/0232_financeiro_fase_a.sql` (corpo de `salvar_venda`)
- Create: `src/lib/financeiro/faseA.db.test.ts` (molde: `src/lib/agenda/compromissos.db.test.ts`)

**Interfaces:**
- `salvar_venda` (`security invoker`), além do que já fazia:
  - `p_parcelas`: array `{ numero, valor, pagador, vence_em }`. Recusa `parcelas_nao_somam` se a soma diferir de `comissao_valor − Σ repasse_valor dos participantes 'direto'` em mais de 0,01; recusa `parcela_ja_recebida` se a venda já tem parcela recebida e o payload muda parcela (o gestor desmarca antes); senão apaga e regrava as parcelas.
  - Participantes viram upsert por `(venda_id, corretor_id)`: atualiza quem já existe, insere os novos, apaga os que saíram. `forma_recebimento` ausente no item mantém a gravada (ou `repasse` para novo).
  - Não grava mais `status` nem `distratada_em`.
  - Novos códigos em `traduzirErroDoBanco` (`venda.ts`): `parcelas_nao_somam` → "As parcelas precisam somar o que a imobiliária recebe."; `parcela_ja_recebida` → "Esta venda já tem parcela recebida. Desmarque o recebimento para mudar as parcelas."; `so_gestor` → "Só o gestor pode fazer isso."

- [ ] **Step 1: Testes que falham** em `faseA.db.test.ts`, com o banco local (sessões de corretor e de gestor do mesmo grupo):
  - corretor chama `distratar_venda` → erro `so_gestor`; gestor → ok, e com 'cancelar' as parcelas abertas ganham `cancelada_em`
  - corretor faz `update venda_parcelas set recebida_em = ...` → erro de permissão
  - corretor manda participante `direto` por `salvar_venda` → `so_gestor`; gestor → ok
  - Review Focus 3: gestor marca `direto`; corretor reenvia sem a chave `forma_recebimento` → continua `direto`
  - Review Focus 2: gestor edita venda com parcela recebida mudando parcelas → `parcela_ja_recebida`; a parcela recebida continua com a data
  - `avisar_distrato` por participante → grava `distrato_avisado_em`; por corretor de fora da venda → recusa
  - Review Focus 1: venda criada no formato antigo (inserir com a 0231 aplicada, depois aplicar a 0232) com comissão recebida e distratada → 1 parcela, recebida, não cancelada
  - `parametros_fiscais`: authenticated lê; insert recusado
- [ ] **Step 2:** `npm run db:teste` e depois `npm run test:isolamento` → FAIL nos novos. Sem Docker, parar aqui e registrar no relatório do task; não pular o teste.
- [ ] **Step 3:** Implementar o corpo de `salvar_venda` e os códigos de erro.
- [ ] **Step 4:** `npm run test:isolamento` → PASS (inclui `isolamento.db.test.ts` e `funcoesSeguras.db.test.ts`, que pegam tabela ou função nova sem grupo).
- [ ] **Step 5: Commit** `feat(banco): salvar_venda grava parcelas e preserva a forma de recebimento`

---

### Task 7: Camada de dados lê o modelo novo

**Files:**
- Modify: `src/lib/financeiro/dados.ts` (`VendaNaTela`: sai `comissaoRecebidaEm`/`comissaoPrevistaEm`, entram `parcelas: Parcela[]`, `distratoMotivo`, `distratoParcelas`, `distratoAvisadoEm`, `distratoAviso`; `ParticipanteNaTela` ganha `formaRecebimento`)
- Modify: `src/lib/financeiro/caixaDados.ts` (`competencia`), `fiscalDados.ts` (lê `regime_apuracao` e `parametros_fiscais`, com fallback `LINHAS_PADRAO` em `sem_tabela`)
- Modify: `src/lib/financeiro/fiscalDoMes.ts` — `receita` passa a ser `receitaBaseDoMes(...).total` com o `regimeApuracao` da config; o RPA usa `parametrosNaData(linhas, pagoEm)` por pagamento; participante `direto` não gera RPA nem entra em `repassesPj`; `FiscalDoMes` ganha `receitaBase: ReceitaBase` e `parametros: ParametrosFiscais`
- Modify: `fiscal.ts` (`VendaParaFiscal`: troca a data única por `parcelas`; `semNotaFiscal` = vendas com alguma parcela recebida e sem nota; DIMOB continua sem distratadas), `fiscalPlanilhas.ts`, `pacoteDoMes.ts`, `assistenteDados.ts`, `assistenteFinanceiro.ts`, `painelDeVendas.ts`, `indicadoresDeVendas.ts`, `graficosDoExtrato.ts`, `src/lib/grupos/planilhasDoGrupo.ts` (coluna "comissão recebida em" vira a data da última parcela recebida, vazia se nenhuma)
- Modify: os `.test.ts` irmãos que quebrarem
- Modify: `vendasSeguras.test.ts` (o `it.todo` do Task 5 vira `it`)

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: `getVendas()` devolve `VendaNaTela` com `parcelas` ordenadas por `numero`; `getFiscalDoMes(mes)` devolve `FiscalDoMes` com `receitaBase` e `parametros`

- [ ] **Step 1:** Transformar a guarda de leitor em `it` → `npx vitest run src/lib/financeiro/vendasSeguras.test.ts` → FAIL, listando os arquivos.
- [ ] **Step 2:** Teste que falha em `fiscalDoMes`, ou no puro que ele chama: com `regimeApuracao: "competencia"`, a receita do mês é a da Task 3, não a do `resultadoDoMes`.
- [ ] **Step 3:** Migrar cada leitor da lista.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc --noEmit` → limpo; `npm run lint` → sem erro novo.
- [ ] **Step 5: Commit** `refactor(financeiro): leitores usam parcelas, regime de apuração e parâmetros vigentes`

---

### Task 8: Ações do servidor

**Files:**
- Modify: `src/app/corretor/(painel)/financeiro/acoes.ts`
- Modify: `src/app/corretor/(painel)/financeiro/fiscal/acoes.ts` (salvar `regimeApuracao`; tirar `tetoInss`)
- Modify: `src/app/corretor/(painel)/financeiro/caixa/acoes.ts` (gravar `competencia`, padrão = mês do vencimento)
- Test: `src/lib/financeiro/venda.test.ts` (validação pura de `VendaDigitada` com parcelas)

**Interfaces:**
- Consumes: as funções SQL do Task 5; `validarParcelas`, `valorDaImobiliaria` (Task 2)
- Produces (substituem `marcarComissaoRecebida`):
  - `salvarVenda(vendaId: string | null, v: VendaDigitada)`: `VendaDigitada` ganha `parcelas: ParcelaNova[]` (se vazia, o servidor usa `dividirEmParcelas(valorDaImobiliaria, 1, null, "construtora")`) e `participantes[].formaRecebimento?`; perde `status`/`distratadaEm`
  - `marcarParcelaRecebida(vendaId: string, parcelaId: string, data: string | null): Promise<ResultadoVenda>`: confere `mesFechadoEntre([dataAntiga, data])`
  - `distratarVenda(vendaId: string, p: { data: string; motivo: string; parcelas: "manter" | "cancelar" }): Promise<ResultadoVenda>`: confere `mesFechadoEntre([p.data])`
  - `desfazerDistrato(vendaId: string): Promise<ResultadoVenda>`: confere o mês do `distratadaEm` atual
  - `avisarDistrato(vendaId: string, texto: string): Promise<ResultadoVenda>`
  - Todas chamam `revalidatePath` das telas do financeiro, como as ações vizinhas.

- [ ] **Step 1: Testes que falham** em `venda.test.ts`: `validarVenda` (ou o validador existente em `venda.ts`) recusa parcelas que não somam `valorDaImobiliaria`; aceita a lista vazia (vira 1 parcela); motivo vazio é recusado pelo validador de distrato `validarDistrato({ data, motivo, parcelas }): string[]`.
- [ ] **Step 2:** `npx vitest run src/lib/financeiro/venda.test.ts` → FAIL.
- [ ] **Step 3:** Implementar os validadores e as ações.
- [ ] **Step 4:** `npm test` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(financeiro): ações de parcela recebida, distrato do gestor e aviso de distrato`

---

### Task 9: Telas

Antes: ler o guia de páginas e server actions em `node_modules/next/dist/docs/`.

**Files:**
- Modify: `src/app/corretor/(painel)/financeiro/FormularioVenda.tsx`: link "dividir em parcelas" que abre a lista (número, valor, vencimento, pagador) já preenchida por `dividirEmParcelas`; sem abrir, manda `parcelas: []`. Para o gestor, cada participante tem o seletor "imobiliária repassa / recebe direto". O status e a data do distrato saem do formulário.
- Modify: `src/app/corretor/(painel)/financeiro/[id]/page.tsx` + componente cliente novo `ParcelasDaVenda.tsx` (lista com a situação de `situacaoDaParcela`; o gestor marca e desmarca recebida) + `DistratoDaVenda.tsx` (gestor: data, motivo e escolha manter/cancelar sem padrão marcado, mais desfazer; corretor: "avisar distrato" com texto opcional, ou "aviso enviado em DD/MM")
- Modify: `src/app/corretor/(painel)/financeiro/fiscal/page.tsx` e `ControlesDoFiscal.tsx`: seletor "Apuração: competência / caixa"; o campo de teto do INSS sai; aparece um bloco "Parâmetros vigentes" com o valor e a fonte de cada um (de `FiscalDoMes.parametros.origem`); o título dos impostos traz "Estimativa — confira com seu contador" enquanto `conferidoEm` for nulo
- Modify: `src/app/corretor/(painel)/financeiro/caixa/ControlesDoCaixa.tsx`: campo "competência (mês)" opcional, recolhido, com o mês do vencimento como padrão
- Modify: extrato do corretor (`extrato/page.tsx`): mostra `liberado` e as situações novas (`recebe_direto`, `parcial`)
- Modify: tela de alertas (onde `alertasDoFinanceiro` é chamada): passar `distratosAvisados`

- [ ] **Step 1:** Implementar as telas.
- [ ] **Step 2:** `npm run build` → sem erro.
- [ ] **Step 3: Conferir no app**, pela skill `run` (ou Playwright), em 390px de largura, com gestor e com corretor: registrar venda de 1 parcela com os mesmos toques de antes; dividir em 3; marcar a 2ª como recebida; distratar com "cancelar" e conferir o caixa; desfazer; corretor avisar distrato e o alerta aparecer para o gestor; tela fiscal mostrando "Estimativa" e as fontes. Tirar capturas.
- [ ] **Step 4: Commit** `feat(painel): parcelas, distrato do gestor e regime de apuração nas telas do financeiro`

---

### Task 10: Produção e registro

- [ ] **Step 1:** Rodar a verificação completa: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 2:** Pedir confirmação ao usuário e então aplicar a 0232 em produção pela skill `aplicar-migration-producao`. Conferir antes e depois: a soma de `comissao_valor` por venda bate com a soma das parcelas.
- [ ] **Step 3:** Pela skill `fechar-tarefa`, escrever a nota atômica `vault/10-notas/financeiro-fase-a-parcelas-e-distrato.md` (tags do vocabulário, `codigo: supabase/migrations/0232_financeiro_fase_a.sql`), linkada em `MOC — CRM e Painel` e `MOC — Banco de Dados`, com uma entrada curta no fim da `docs/MEMORIA.md`. Atualizar também `vendas-e-o-modulo-financeiro.md` e `fiscal-da-imobiliaria.md` (data, link da nota nova).
- [ ] **Step 4: Commit** `docs(vault): Fase A do financeiro`
- [ ] **Step 5:** Publicar só com o OK do usuário (skill `publicar-em-producao`).
