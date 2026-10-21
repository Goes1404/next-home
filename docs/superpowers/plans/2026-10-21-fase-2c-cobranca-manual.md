# Fase 2C enxuta — cobrança manual e suspensão (21/10/2026)

Spec: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
§11 (painel marca pagamento e suspende/reativa), §19 resposta 6 e §20
("Grupo suspenso", "Ciclo da mensalidade"). Escolhida pelo dono em 21/10.

## Regras (decididas pelo dono — não mudar)

- **Ciclo:** a mensalidade vence todo mês no dia do cadastro do grupo, sem
  pro rata. Troca de plano vale no ciclo seguinte (só registro; sem tela de
  troca nesta fase).
- **Aviso:** desde o dia do vencimento sem pagamento, o painel do grupo
  mostra aviso de pagamento.
- **Suspensão automática no 5º dia de atraso** (vencimento + 5 dias, sem
  pagamento). A plataforma também suspende e reativa à mão.
- **Grupo suspenso para o que custa:** IA no WhatsApp (respostas e
  follow-ups), listas de transmissão, artes e vídeos. O painel abre com
  aviso de pagamento; o site público continua no ar; o login continua.
  **O cliente final nunca vê erro:** a IA fica calada e o corretor atende à
  mão.
- **Plano `custo` (a Next Home, grupo 1) nunca é cobrado nem suspenso
  automaticamente.**

## Decisões do construtor (registrar no relatório)

1. Primeira competência = o mês do cadastro, vencendo no dia do cadastro (a
   plataforma registra o primeiro pagamento ao criar o grupo). Dia do
   vencimento guardado em `grupos.dia_do_vencimento` (1–28; cadastro em
   29/30/31 vira 28), editável pela plataforma.
2. A suspensão automática é DERIVADA na leitura (pura), não gravada por
   cron: `suspenso = situacao = 'suspenso' OR (plano <> 'custo' AND
   dias de atraso >= 5)`. Sem cron novo (o Hobby já tem 4) e sem estado que
   diverge. `grupos.situacao = 'suspenso'` fica sendo a suspensão MANUAL.
3. Erro de leitura da cobrança libera a operação (com log), como a cota da
   IA: falha nossa não pode calar o atendimento de quem pagou.

## Banco — migration `supabase/migrations/0207_cobranca_manual.sql`

Padrão das migrations recentes (`begin; set local lock_timeout = '5s'; …
commit;`). Copiar o bloco de tabela/policy/gatilhos de
`supabase/migrations/0197_cota_da_ia.sql` (tabela `uso_da_ia`, que também é
filha direta de `grupos`).

- `grupos`: `mensalidade numeric(10,2)` (nulo = não definida),
  `dia_do_vencimento smallint not null default 1 check (between 1 and 28)`;
  backfill: `least(extract(day from created_at at time zone
  'America/Sao_Paulo'), 28)`. Sem grant novo (a sessão não escreve em
  `grupos`; confira o que a 0195/0196 deixaram).
- Tabela `pagamentos_do_grupo`: `id uuid pk default gen_random_uuid()`,
  `grupo_id uuid not null references grupos(id) on delete cascade`,
  `competencia date not null` (dia 1º do mês), `valor numeric(10,2) not null
  check (valor >= 0)`, `pago_em date not null`, `registrado_por uuid` (o
  `auth.users.id` do admin da plataforma, sem FK), `observacao text`,
  `created_at timestamptz not null default now()`,
  `unique (grupo_id, competencia)`. RLS ligada, `revoke all` de `anon` e
  `authenticated`, policy restritiva `isolamento_por_grupo`, gatilhos
  `_00_grupo` / `_zz_grupo_*` como em `uso_da_ia`. Só a chave de serviço lê
  e grava.
- `admin_eventos.acao`: acrescentar `'pagamento_registrado'`,
  `'pagamento_removido'`, `'grupo_suspenso'`, `'grupo_reativado'` ao CHECK
  (ver como a 0202 recriou o CHECK, e repetir a lista inteira da última
  definição + as novas).
- Atualizar `src/lib/supabase/types.ts` à mão (colunas e tabela nova), como
  as fases anteriores.

## Lógica pura — `src/lib/planos/cobranca.ts` (+ teste)

```ts
export type EstadoDaCobranca = "isento" | "em_dia" | "pendente" | "suspenso";
export function situacaoDaCobranca(p: {
  plano: string;
  suspensoManual: boolean;            // grupos.situacao === 'suspenso'
  criadoEm: string;                   // grupos.created_at
  diaDoVencimento: number;            // 1..28
  competenciasPagas: string[];        // 'YYYY-MM-01'
  hoje: Date;
}): {
  estado: EstadoDaCobranca;
  competenciaEmAberto: string | null; // a MAIS ANTIGA vencida e não paga
  vencimento: string | null;          // 'YYYY-MM-DD' dessa competência
  diasDeAtraso: number;               // 0 no dia do vencimento
  suspendeEm: string | null;          // vencimento + 5 dias
  proximoVencimento: string;          // da próxima competência ainda não vencida
};
export const DIAS_ATE_SUSPENDER = 5;
```

Datas no fuso de São Paulo (use os ajudantes que já existem no projeto;
procure `diaEmSP` / `mesEmSaoPaulo`). Testes obrigatórios: plano custo é
isento mesmo sem pagamento; grupo novo antes do primeiro vencimento está em
dia; no dia do vencimento sem pagamento = `pendente` com 0 dias; com 4 dias =
`pendente`; com 5 dias = `suspenso`; pagou a competência = `em_dia`; duas
competências atrasadas mostram a mais antiga; `suspensoManual` vence tudo,
inclusive plano custo; virada de mês às 23h de SP não muda o dia.

## Leitura no servidor — `src/lib/planos/cobrancaDoGrupo.ts`

`lerCobrancaDoGrupo(grupoId, agora?)` pela chave de serviço (grupos +
pagamentos do grupo) → resultado de `situacaoDaCobranca`; erro de leitura →
log e `{ estado: "em_dia", … }` (decisão 3). Exportar também
`grupoSuspenso(grupoId): Promise<boolean>`.
Classificar o arquivo no mapa de `src/lib/grupos/servicoComGrupo.test.ts`
(categoria `por-id`: o grupo vem de quem chama).

## Onde a suspensão vale

1. **Webhook** (`src/app/api/webhooks/whatsapp/route.ts`): junto de
   `lerCotaDaIa(instancia.grupoId)` (Promise.all que já existe), ler
   `grupoSuspenso`. `decidirSeAIaResponde` ganha `grupoSuspenso?: boolean`
   → silêncio com motivo novo `"grupo_suspenso"` (sem `voltaEm`), tratado em
   `registroDoSilencio`/rótulos como o `cota_do_grupo`. A mensagem do
   cliente continua gravada; o corretor atende à mão.
2. **Follow-ups e respostas atrasadas** (`src/app/api/cron/followups/route.ts`):
   pular conversas/instâncias de grupo suspenso (não gasta IA).
3. **Listas de transmissão** (`src/lib/whatsapp/campaignDispatcher.ts`): a
   instância de grupo suspenso não dispara (sem mudar a fila; volta sozinha
   quando o pagamento for registrado).
4. **Artes** (`src/app/api/imagens/gerar/route.ts`) e **vídeos** (action de
   criar vídeo em `src/app/corretor/(painel)/marketing/video/`): recusar com
   mensagem "Pagamento da mensalidade pendente: geração de artes/vídeos
   pausada. Fale com o gestor." antes de qualquer custo.
5. **Painel** (`src/app/corretor/(painel)/layout.tsx`): faixa no topo para
   todos os usuários do grupo quando `pendente` ("Mensalidade vencida em
   DD/MM. Os recursos pagos param em DD/MM.") ou `suspenso` ("Mensalidade em
   atraso: IA, listas, artes e vídeos estão pausados. O site e o painel
   continuam."). Some quando em dia. Padrão visual: igual à faixa de
   conexão que já existe (procure `FaixaConexao`).

## Painel da plataforma (`src/app/plataforma/`)

- `grupos/[id]/page.tsx`: seção "Cobrança": estado, competência em aberto,
  próximo vencimento, mensalidade, histórico de pagamentos (12 últimos);
  formulário para registrar pagamento (competência mês/ano, valor, data do
  pagamento, observação) e remover um registro errado; campos mensalidade e
  dia do vencimento; botões "Suspender" / "Reativar" (manual).
- Actions em `src/app/plataforma/acoes.ts` (ou arquivo vizinho
  `cobrancaAcoes.ts`), sempre `exigirAdminDaPlataformaNaAcao()` primeiro,
  chave de serviço depois, evento em `admin_eventos` (como
  `ajustarTetoDaIa`). Validar: valor ≥ 0, competência válida, não registrar
  pagamento para plano custo? (permitir, só não é exigido).
- `page.tsx` (lista de grupos): coluna/etiqueta com o estado da cobrança.

## Verificação

- `npx tsc --noEmit -p .` (no Windows há 4 erros conhecidos de PixelMeta);
- `npx vitest run --exclude ".claude/**"`;
- `npm run db:teste` e depois
  `DB_TESTE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run --exclude ".claude/**" $(git ls-files '*.db.test.ts')`
  e `npx supabase@2.121.0 stop --no-backup`.
- Guardas que vão reclamar e devem ser atendidas (não desligadas):
  `tabelasSeguras`, `servicoComGrupo`, `funcoesSeguras`, `contaOculta`,
  `botoesComPista`, `naoCortaTexto`.

## Fora do escopo

Cobrança automática, faturas/notas, e-mail de cobrança, troca de plano com
tela, pro rata, registro diário de assento, saúde por grupo.
