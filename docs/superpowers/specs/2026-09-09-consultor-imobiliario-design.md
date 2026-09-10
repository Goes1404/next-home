# Consultor imobiliário — o chat que conhece o portfólio e o negócio

> Data: 2026-09-09 · Status: aprovado, aguardando plano de implementação

## O problema

O corretor tem duas perguntas por dia que hoje não têm resposta rápida em
lugar nenhum:

1. **"Qual imóvel serve para esta pessoa?"** — o catálogo tem 25 publicados
   com ficha, lazer, tipologia e preço no banco, e a única forma de cruzar
   isso com "renda 8 mil, 2 dormitórios, quer pronto em Barueri" é abrir os
   25 à mão.
2. **"Isso fecha?"** — capacidade de pagamento, faixa do MCMV, quanto o FGTS
   abate, quanto de ITBI, o que responder para quem disse que está caro.

O painel não responde nenhuma das duas. A Sofia responde a segunda para o
CLIENTE, no WhatsApp, e com a régua invertida (ela é proibida de falar
valores). Falta a ferramenta do corretor.

## Decisões tomadas no brainstorming

| Pergunta | Decisão |
|---|---|
| Quem usa | **O corretor, no painel.** Não é chat público, não concorre com a Sofia. |
| Escopo do "especialista" | Os quatro: portfólio, crédito e financiamento, objeção e argumentação, jurídico e documentação. |
| Fonte dos números de crédito | **Tela de ajustes no painel** (decisão do usuário), com a tabela **seedada na migration com os valores de hoje**. |
| Saídas | Cartão do imóvel, simulação de financiamento, "copiar pro cliente". Texto puro não basta. |
| Arquitetura | Módulo próprio (`src/lib/consultor/`), no molde do Estúdio (0096). Não estender o Estúdio; não usar RAG. |

**Por que a tabela nasce seedada.** A régua da casa registra sete recursos
completos que nunca produziram uma linha porque dependiam de alguém
preencher. Tela de ajustes tem exatamente esse risco. A migration escreve os
valores vigentes; a tela só EDITA. O consultor nunca depende de alguém abrir
uma tela para funcionar.

**Por que não estender o Estúdio.** `estudio_*` existe para gastar geração
paga só depois do OK — tem `imagem_id`, `video_job_id` e uma proposta que é
o contrato do gasto. O consultor não gasta nada além do turno de texto.
Misturar os dois põe colunas sem sentido em metade das linhas e faz as
guardas de um domínio valerem para o outro.

**Por que não RAG.** 25 fichas completas cabem no prompt inteiras — o
`gpt-4.1-mini` tem folga de sobra e o agente de produção já roda com ~4.000
tokens de prompt. `pgvector` é infra nova para um problema que só existe
acima de ~150 imóveis. Quando chegar lá, o ponto de troca é
`conhecimento.ts`, e só ele.

---

## Arquitetura

### Módulos

```
src/lib/consultor/
  contrato.ts        PURO. Tipos das mensagens e do `dados` (cartão, simulação,
                     pergunta, texto-pro-cliente) + o validador de jsonb torto.
                     Mesma razão de `estudio/contrato.ts`: a tela cliente lê
                     estes tipos, então nada de `server-only` aqui.
  financiamento.ts   PURO. A conta: capacidade de pagamento, faixa, subsídio,
                     entrada mínima, ITBI, parcela estimada. Zero I/O, zero LLM.
  conhecimento.ts    PURO. Monta os três blocos do prompt a partir do catálogo,
                     dos parâmetros de crédito e do corpus de objeções.
  prompt.ts          PURO. A identidade, as regras e a ordem dos blocos.
  guardrails.ts      PURO. Descarta slug fora do catálogo e número de crédito
                     que não está no bloco.
  turno.ts           server-only. UMA chamada de LLM por turno, via `llm.ts`.
  repositorio.ts     server-only. Leitura/escrita das duas tabelas.

src/lib/credito/
  tipos.ts           PURO. A forma dos parâmetros (faixa, teto, taxa, ITBI).
  parametros.ts      server-only. Lê a tabela; devolve `tipos.ts`.

src/app/corretor/(painel)/consultor/
  page.tsx           Server Component. Carrega conversa + histórico.
  ChatConsultor.tsx  "use client". Reusa `_componentes/ChatBase.tsx`.
  acoes.ts           Server Actions: enviar turno, nova conversa, copiar.

src/app/corretor/(painel)/admin/credito/
  page.tsx           Tela do gestor. `exigirGestorNaPagina()`.
  acoes.ts           `exigirGestorNaAcao()`.
```

**A regra de constante compartilhada vale aqui.** `ChatConsultor.tsx` é
`"use client"` e vai querer ler tipos e talvez um teto. Tipo viaja de graça
(é apagado); constante é valor, e importá-la de um módulo `server-only`
derruba o build — a pedra do `limitesPdf.ts` e do `pessoasTipos.ts`. Todo
valor compartilhado mora em `contrato.ts` ou `tipos.ts`.

### Tabelas (migrations 0101 e 0102)

`0101_consultor_conversas.sql` — molde exato da 0096, sem os vínculos de peça
paga:

```sql
create table public.consultor_conversas (
  id            uuid primary key default gen_random_uuid(),
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  titulo        text not null default 'Nova conversa',
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.consultor_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.consultor_conversas(id) on delete cascade,
  papel       text not null check (papel in ('corretor', 'ia')),
  conteudo    text not null,
  dados       jsonb,
  created_at  timestamptz not null default now()
);
```

`0102_parametros_credito.sql` — UMA linha, seedada, editável pelo gestor:

- Colunas: faixas do MCMV (renda teto e subsídio por faixa), teto de uso do
  FGTS, taxa SBPE de referência, alíquota de ITBI por cidade, percentual
  máximo de comprometimento de renda, `conferido_em`, `conferido_por`.
- `insert` na própria migration com os valores vigentes em 2026-09-09.
- **Sem INSERT nem DELETE para `authenticated`.** É linha única: quem cria é
  a migration. `update` concedido **coluna a coluna** e só para gestor (via
  função `security definer`, mesmo regime de `definir_papel_corretor`).

Os dois passos obrigatórios desta base entram nas duas migrations:
`revoke all ... from anon` (o default do Supabase abre a tabela nova — a 0080
e a 0082 já pagaram por isso) e conferência **nos dois sentidos** com
`begin; set local role ...; rollback;` — `anon` sem acesso E o dono lendo o
que deve ler.

### Fluxo de um turno

```
corretor escreve
  → acoes.ts grava a mensagem dele
  → conhecimento.ts monta os três blocos (catálogo, crédito, objeções)
  → prompt.ts junta identidade + regras + blocos + histórico (20 mensagens)
  → llm.ts: UMA chamada, contrato JSON
  → guardrails.ts: descarta slug inexistente e número de crédito fora do bloco
  → financiamento.ts: se a IA pediu simulação, a CONTA acontece aqui
  → grava a mensagem da IA com `dados` tipado
  → a tela desenha cartão / quadro de simulação / botão de copiar
```

**A IA não faz aritmética.** Ela extrai (renda, entrada, imóvel, prazo) e
pede a simulação; `financiamento.ts` calcula. Modelo errando conta manda
número errado para o cliente — a mesma razão por que o telefone é
normalizado em código e o chunking não é pedido no prompt.

---

## O prompt: três blocos determinísticos

### 1. Catálogo completo

Os 25 publicados, ficha inteira: nome, apelidos (`nomes_alternativos`),
construtora, bairro, cidade, status com **rótulo humano** (`STATUS_LABEL`,
nunca o enum cru), dormitórios, suítes, banheiros, vagas, metragens,
tipologias, lazer que EXISTE, preço, slug.

- **Preço ENTRA.** Aqui quem lê é o corretor. `semValores.ts` não se aplica
  a esta superfície, e isso precisa estar escrito para ninguém "consertar"
  depois.
- **A ficha diz a ausência em voz alta** ("SEM planta cadastrada", "sem prazo
  de entrega no cadastro"). Listar só o que existe faz o modelo preencher o
  resto — esta base pagou por isso quatro vezes (1 suíte, pronto para morar,
  prazo, acabamento).
- Rascunhos ficam de fora: o consultor recomenda o que dá para vender.

### 2. Parâmetros de crédito

O bloco traz os números da tabela **com a data da última conferência**, e a
regra dura: *número de crédito que não está neste bloco, você não cita —
pergunta ou manda conferir na fonte.* Dupla defesa, como no preço e no prazo:
o bloco avisa ANTES, o guardrail corta DEPOIS.

### 3. Objeções da casa

O corpus real que `aprendizadoContinuo.ts` já colhe, recortado por relevância
(o mesmo critério de `recuperacao.ts`: assunto, conversão, engajamento,
recência como desempate). O que a corretora que fecha negócio de fato
respondeu, não o que um manual de vendas diz.

### Jurídico e documentação

Sem bloco de dados — é conhecimento geral do modelo. O que o prompt impõe:
citar a fonte onde conferir (cartório, prefeitura, CRECI), nunca afirmar
alíquota ou prazo legal que não esteja no bloco de crédito, e distinguir "o
que costuma ser" de "o que a lei exige". Risco assumido e registrado abaixo.

---

## As três saídas tocáveis

**Cartão do imóvel.** A IA devolve `slug`; o código monta foto, ficha e link
para `/corretor/imoveis/<slug>`. Ela nunca escreve URL — link errado leva o
corretor a um 404 (`linkDaPagina` já resolve isso do lado do cliente).

**Quadro de simulação.** `financiamento.ts` devolve: quanto financia, entrada
mínima, subsídio, faixa, parcela estimada, ITBI, e **o que a conta assume**
(taxa, prazo, percentual de comprometimento). Estimativa sem premissa visível
é número que ninguém pode conferir.

**Copiar pro cliente.** Reescreve a resposta no tom de WhatsApp — curto, sem
markdown, sem abertura de robô. `vozHumana.ts` já faz exatamente isso; é
reuso, não código novo.

---

## Guardrails

| Risco | Defesa |
|---|---|
| Imóvel que não existe | Slug fora do catálogo é descartado antes de virar cartão (a lição do `resolverMidia`: alucinação impossível por construção). |
| Spec inventada (suíte, metragem, acabamento) | Ficha completa no prompt + ausência em voz alta + `removerAcabamentoInventado` reusado. |
| Prazo de entrega inventado | `afirmaPrazo` reusado, com a régua de três partes já corrigida na v24. |
| Número de crédito desatualizado ou inventado | Bloco com data de conferência + regra dura + corte na saída. |
| Conta errada | A IA não calcula. `financiamento.ts` calcula, e tem teste. |
| Lei afirmada errado | Prompt obriga a nomear onde conferir e a separar praxe de exigência legal. |

---

## Navegação

Tópico próprio no menu — o **7º**, que é exatamente o teto da régua
(`navegacao.test.ts`). Alternativa registrada: subtópico de Imóveis, se o
teto incomodar. A escolha do tópico próprio é deliberada: ferramenta que
precisa ser usada todo dia e que vive atrás de um clique extra é ferramenta
que não é usada — o painel já provou isso com o aviso de apelidos, que não
moveu nada em cinco dias porque morava dentro do editor.

---

## Ordem de construção, e a skill que abre cada etapa

Cada área começa **invocando a skill que serve àquela área**, antes de
escrever a primeira linha. Não é cerimônia: cada uma dessas skills carrega
uma régua que este projeto já viu ser esquecida.

| # | Área | Skill(s) a invocar ANTES | Por quê |
|---|---|---|---|
| 0 | Plano de implementação | `superpowers:writing-plans` | Terminal obrigatório do brainstorming. Nada começa sem o plano escrito. |
| 1 | Migrations 0101/0102 + RLS + grants | `supabase:supabase-postgres-best-practices` | Tabela nova nasce aberta para `anon` neste projeto (0080, 0082). A skill cobre grant, policy e o regime de coluna a coluna. |
| 2 | `financiamento.ts` (a conta) | `superpowers:test-driven-development` | É a peça que produz número que vai para o cliente. Teste primeiro, sem exceção — a conta é pura e não tem desculpa para nascer sem caso. |
| 3 | `contrato.ts` + `conhecimento.ts` + `prompt.ts` | `superpowers:test-driven-development` | Validador de jsonb torto e montagem de bloco são exatamente o que quebra calado. |
| 4 | `turno.ts` + guardrails | `superpowers:test-driven-development`, depois `write-judge-prompt` | O turno é onde a resposta nasce; o juiz é como se mede se ela presta. |
| 5 | Qualidade da resposta (a parte cara) | `error-analysis` → `write-judge-prompt` → `validate-evaluator` → `generate-synthetic-data` | Nesta ordem. Este projeto já escreveu quatro critérios que reprovaram o comportamento CERTO por serem inventados em vez de derivados dos dados. Error analysis primeiro: ler transcrições reais, categorizar falha, e só então escrever critério. |
| 6 | Tela do chat (`ChatConsultor.tsx`) | `frontend-design:frontend-design` + `tailwindcss-mobile-first` | O painel é usado no CELULAR. A régua de 44px, a proibição de rolagem lateral em navegação e o mobile-first não são opinião aqui — têm teste (`naoRolaDeLado.test.ts`). |
| 7 | Tela de parâmetros de crédito (gestor) | `frontend-design:frontend-design` | Formulário do gestor, mesma régua. |
| 8 | Fechamento | `superpowers:verification-before-completion` → `superpowers:requesting-code-review` → `code-review` | Verificar antes de dizer "pronto" é a régua que esta base cobra em toda sessão. |
| — | Qualquer bug no caminho | `superpowers:systematic-debugging` | Antes de propor conserto, não depois. |
| — | Encerramento da tarefa | `desktop-commander:obsidian-vault` | `AGENTS.md`: nota atômica em `vault/10-notas/` + link de MOC. Não é opcional. |

Regra que atravessa tudo, do `AGENTS.md`: **antes de escrever código de
Next.js, ler o guia em `node_modules/next/dist/docs/`.** Esta versão tem
breaking changes em relação ao que o modelo "sabe".

---

## Testes e guardas

Além dos testes de unidade de cada módulo puro:

- `financiamento.test.ts` — casos de faixa, subsídio, teto de FGTS, e o caso
  de renda que NÃO fecha (o que mais importa: dizer não cedo evita visita
  perdida).
- `consultorGuardrails.test.ts` — slug inexistente descartado; número de
  crédito fora do bloco cortado. Provocada com dente antes de entrar.
- `tabelasSeguras.test.ts` e `viewsSeguras.test.ts` — já existem e vão cobrar
  as duas tabelas novas sozinhos.
- `navegacao.test.ts` — o 7º tópico bate no teto; o teste precisa ser
  atualizado com o motivo escrito, não afrouxado em silêncio.
- `linksDeFiltro.test.ts` — se o cartão apontar para lista filtrada, o
  parâmetro tem de ser o que a lista LÊ (esta base errou isso duas vezes).

## Fora de escopo (YAGNI)

- RAG / embeddings — reavaliar acima de ~150 imóveis.
- Chat público para o cliente — a Sofia já ocupa esse lugar, com régua oposta.
- Simulação oficial da Caixa via API — a nossa é ESTIMATIVA, e o quadro diz
  isso em voz alta.
- Histórico compartilhado entre corretores — cada um vê o seu (RLS).
- Voz / áudio.

## Riscos conhecidos

1. **A tela de parâmetros pode envelhecer.** Mitigado pelo seed e pela data
   de conferência aparecendo no prompt e na resposta. Se a data ficar velha
   demais, a resposta passa a dizer isso ao corretor.
2. **Jurídico é o único bloco sem dado nosso.** É onde a IA pode afirmar lei
   errada. Mitigado pela obrigação de nomear a fonte; medido na etapa 5.
3. **Custo.** Uma chamada de texto por turno, prompt de ~6-8k tokens com o
   catálogo inteiro. Mesma conta do atendimento, e divide o mesmo saldo da
   OpenAI — sem crédito, a Sofia cai junto. Medir o custo real por turno na
   etapa 4 e registrar aqui.
