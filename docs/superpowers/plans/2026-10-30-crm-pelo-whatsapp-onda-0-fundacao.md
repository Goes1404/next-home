# CRM pelo WhatsApp — Onda 0: fundação do número central — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O número 11 96867-1127 conectado como instância da plataforma. Ele reconhece quem da equipe escreve (texto ou áudio), dá boas-vindas, responde "o que você sabe fazer?" e "ainda não sei fazer isso" para o que é de ondas futuras. Fica em silêncio para quem não é da equipe e registra todo comando. Nenhuma ação grava dado do CRM nesta onda. E, pedido do dono, **quando o WhatsApp de um corretor desconecta do sistema, o central avisa o corretor por WhatsApp** (hoje o aviso é só por e-mail).

**Architecture:**
- **Instância própria.** O central é uma instância Evolution registrada numa tabela própria e global (`central_da_plataforma`), não em `corretor_whatsapp_instancias`: aquela tabela tem `corretor_id not null unique` e 42 arquivos supõem um corretor.
- **Webhook.** A instância é desviada logo no início (`route.ts`, depois de ler `instanceName`, ~:268) para um módulo próprio, `src/lib/central/`. Toda instância de corretor passa a ignorar o número central, contra o laço entre as duas IAs.
- **Cérebro.** Um cliente OpenAI novo com `tools` e histórico de mensagens. Hoje não existe tool calling no repositório.
- **Ferramentas.** As 33 capacidades da spec já são declaradas nesta onda, cada uma marcada com a sua onda. As que não são da onda 0 respondem "ainda não sei fazer isso". Assim o eval mede a escolha de ferramenta desde já, e cada onda seguinte só troca o tratador.
- **Proposta e "sim".** O mecanismo é construído e testado aqui com uma ferramenta falsa, mas nenhuma ferramenta real de ação existe na onda 0.

**Tech Stack:** Next.js App Router (versão do repo; ler `node_modules/next/dist/docs/` antes de codar), Supabase Postgres, Evolution API (Baileys), OpenAI Chat Completions por `fetch` (padrão de `src/lib/whatsapp/openai.ts`), Vitest, scripts `tsx` de eval.

**Spec:** `docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md` (seções 3.0, 4, 5 e 8).

## Global Constraints

- **Migration nova:** `supabase/migrations/0249_central_da_plataforma.sql`. A última hoje é 0247; conferir em `origin/main` e em `RESERVADOS` (`src/lib/migrations.test.ts:44-58`) antes de criar. Ela deve ser:
  - aditiva, com `begin; set local lock_timeout = '5s'; … commit;`;
  - aplicada em produção ANTES do deploy (skill local `aplicar-migration-producao`).
- **Tabela por grupo:** `grupo_id`, os três gatilhos e a policy restritiva, copiando o bloco de `supabase/migrations/0204_roleta_dos_anuncios.sql:41-66`.
- **Tabela global:** entra em `TABELAS_GLOBAIS` (`src/lib/grupos/tabelasDoGrupo.ts:15`), conferida por `isolamento.db.test.ts`. Sem grant para `anon`/`authenticated`.
- **O contexto vem da identificação, nunca da IA.** Corretor, grupo e papel saem da busca pelo telefone (Task 3). A IA nunca escolhe de quem são os dados (spec 4.2).
- **Chave de serviço:** todo arquivo novo que a use entra no mapa de `src/lib/grupos/servicoComGrupo.test.ts` com a categoria certa.
- **Custo:** toda chamada de IA registra `registrarConsumoDaIa` com a finalidade nova `"comando"`. É um union TS em `src/lib/planos/custoDaIa.ts:16-34` mais o rótulo em `ROTULO_DA_FINALIDADE`; não precisa de migration. O cliente novo entra na guarda `src/lib/planos/consumoCompleto.test.ts`.
- **Cota:** os comandos contam na cota da imobiliária e podem suspendê-la (spec 4.8). `lerCotaDaIa(grupoId).nivel === "esgotada"` ou `grupoSuspenso(grupoId)` respondem: "A cota de IA do mês acabou; fale com o gestor."
- **Fuso:** `America/Sao_Paulo` em toda data falada (`Intl.DateTimeFormat` com `timeZone`).
- **Testes:** `npx vitest run --dir src` (nunca sem `--dir src`). Depois `node scripts/lintTeto.mjs`, `npx next build`, `node scripts/bundleTeto.mjs`.
- **Segredos:** `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_WEBHOOK_SECRET` e `OPENAI_API_KEY` vêm do ambiente. Nunca no código, no log ou no texto de resposta.
- **Textos ao usuário** em português, curtos, sem jargão ("instância", "cota de tokens" e "ferramenta" não aparecem).

## Review Focus

1. **Laço.** A mensagem do corretor para o central (`fromMe` na instância dele) e a resposta do central (entrada na instância dele) não podem criar lead, nem conversa, nem acionar a IA na instância do corretor. Testes na Task 2.
2. **Isolamento.** Corretor da Next Home não vê nada de outra imobiliária. Número em duas imobiliárias pergunta qual. Imobiliária com o recurso desligado recebe silêncio. Testes na Task 3.
3. **Silêncio.** Número desconhecido, usuário inativo e grupo não recebem nada, e o texto deles não é gravado (só a tentativa). Testes nas Tasks 3 e 6.
4. **Nenhuma gravação no CRM.** Na onda 0, nenhuma ferramenta escreve em `leads`, `visitas`, `whatsapp_*` ou em tabela de negócio. Guarda de código na Task 5.
5. **Proposta e "sim"** (só com ferramenta falsa nesta onda):
   - "sim" 45 min depois ainda confirma, e passada 1 h não confirma mais;
   - "não, é 6 mil" refaz a proposta;
   - outro pedido cancela;
   - pedido composto vira uma proposta só.

   Testes na Task 5.
6. **Indisponível.** Com o motor de IA fora (sem crédito, timeout), a resposta é "estou indisponível agora", nunca o silêncio. Teste na Task 6.
7. **Aviso de queda.** No máximo UM por queda, somando e-mail e WhatsApp. Nunca sai pela instância do próprio corretor, que está caída. Corretor sem e-mail passa a ser avisado pelo central. Com o central desconectado, o e-mail continua sozinho. Testes na Task 10.

---

### Task 0: Branch de trabalho

- [ ] Criar a branch a partir de `origin/main` atualizada. Conferir que 0249 está livre (`ls supabase/migrations | tail`, `git log origin/main --oneline -5`).

### Task 1: Migration 0249 — central, chave por imobiliária, estado e registro

**Files:** `supabase/migrations/0249_central_da_plataforma.sql`, `src/lib/supabase/types.ts`, `src/lib/grupos/tabelasDoGrupo.ts`

- [ ] `central_da_plataforma` (global, uma linha por número):
  - `id`;
  - `instance_name text unique not null`;
  - `telefone text not null`, só dígitos com 55;
  - `status_conexao text not null default 'desconectado'`;
  - `conectado_em`, `desconectado_em`, `created_at`.

  RLS ligada, sem policy, `revoke all` de `anon`/`authenticated`. Entra em `TABELAS_GLOBAIS`.
- [ ] `grupos.central_whatsapp_ativo boolean not null default false` (padrão das chaves de 0246:172-176 e 0215:12).
- [ ] Índice de busca por telefone: `create index corretores_whatsapp_ativos_idx on corretores (whatsapp) where ativo`. Hoje não há índice em `whatsapp`.
- [ ] `central_estado` (por grupo; uma linha por `corretor_id`, unique):
  - `historico jsonb not null default '[]'`, com as mensagens da janela de 30 min;
  - `proposta jsonb`, com `proposta_expira_em timestamptz`;
  - `grupo_escolhido uuid`, para quem está em duas imobiliárias;
  - `boas_vindas_em`, `atualizado_em`.

  Bloco de grupo da 0204.
- [ ] `central_comandos` (por grupo; o registro da spec 4.6):
  - `corretor_id`, `mensagem_id text unique` (deduplica reentrega);
  - `tipo` ('texto' | 'audio' | 'imagem');
  - `texto text`, que é apagado depois de 30 dias;
  - `ferramentas jsonb`, `proposta jsonb`, `confirmado boolean`;
  - `resultado text`, `erro text`;
  - `custo_centavos int`, `latencia_ms int`, `created_at`.

  Bloco de grupo da 0204.
- [ ] `central_tentativas` (global; desconhecido, inativo ou recurso desligado): `telefone_hash text`, `motivo text`, `mensagem_id text unique`, `created_at`. **Nunca o texto.**
- [ ] Teste: `src/lib/migracoesAtomicas.test.ts` passa. Atualizar `types.ts` à mão com as tabelas e a coluna nova.

### Task 2: O central é invisível para as instâncias dos corretores (laço)

**Files:**
- Create: `src/lib/central/numeroDoCentral.ts`, `src/lib/central/numeroDoCentral.test.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts`, entre a saída de "sem remetente" (~:488) e `tratarConversaComOSistema` (~:499)

- [ ] `numeroDoCentral()`: lê `central_da_plataforma.telefone` com cache de 60 s em memória e devolve `null` sem central. `ehNumeroDoCentral(sender)` compara com `mesmoNumero` de `src/lib/crm/retornoPeloGrupo/participantesDoGrupo.ts:110` (com e sem 55 e com e sem o nono dígito).
- [ ] No webhook, para qualquer instância de corretor: se `ehNumeroDoCentral(sender)`, devolver `{ ok: true, ignorado: "central" }` e sair. Vale para `fromMe` e para entrada, **antes** do convite e da palavra-chave (~:518), do porteiro (~:584) e de `registrarMensagemBarrada` (~:644).
- [ ] Testes:
  - unitário de `ehNumeroDoCentral` (variações de 55 e do nove, `null` sem central);
  - guarda de código: no `route.ts`, a chamada de `ehNumeroDoCentral` vem antes de `tratarConversaComOSistema(`, de `cadastrarPelaPalavraChave(` e de `obterOuCriarConversa(`.

  Provocar: mover a chamada para depois e ver o teste reprovar.

### Task 3: Quem está falando (puro, com banco falso)

**Files:** `src/lib/central/identificar.ts`, `src/lib/central/identificar.test.ts`

- [ ] `identificarRemetente(supabase, { telefone, lid })` devolve um destes:
  - `{ tipo: "desconhecido" }`;
  - `{ tipo: "inativo" }`;
  - `{ tipo: "desligado", grupoId }`;
  - `{ tipo: "escolher", opcoes: [{grupoId, nome}] }`;
  - `{ tipo: "pessoa", corretorId, grupoId, papel, nome }`.
- [ ] Busca em `corretores` por `whatsapp in candidatosTelefone(...)` (`src/lib/whatsapp/repositorio.ts:256`) **ou** `whatsapp_lid = lid`, só `ativo`. Junta `grupos.central_whatsapp_ativo`. Quando há mais de um grupo ligado, usa `central_estado.grupo_escolhido` se houver; senão devolve "escolher".
- [ ] "Trocar de imobiliária" limpa `grupo_escolhido`.
- [ ] Testes, com o banco falso no padrão de `src/lib/whatsapp/primeiroContatoNoEnvio.test.ts`:
  - número de ninguém: desconhecido;
  - corretor inativo: inativo;
  - grupo com o recurso desligado: desligado;
  - a mesma pessoa em dois grupos ligados: escolher, e depois da escolha, pessoa;
  - LID sem número: pessoa;
  - número só sem o nove: pessoa.

### Task 4: Cérebro — cliente com ferramentas e histórico

**Files:**
- Create: `src/lib/central/cerebro.ts`, `src/lib/central/cerebro.test.ts`
- Modify: `src/lib/planos/custoDaIa.ts` (finalidade `"comando"`), `src/lib/planos/consumoCompleto.test.ts`

- [ ] `pensar({ sistema, historico, mensagem, ferramentas, executar, quemPaga, orcamentoMs })`:
  - faz `fetch` em `/v1/chat/completions` com `messages`, `tools` e `tool_choice: "auto"`;
  - roda o laço de `tool_calls` até 4 voltas: chama `executar(nome, args)` e devolve a saída como mensagem `tool`;
  - devolve `{ texto, chamadas, tokens }`.
- [ ] O modelo vem de `CENTRAL_MODELO` (ambiente), com padrão de primeira linha. O valor final sai do eval da Task 9. Família `gpt-5`/`o*`: `max_completion_tokens`, como em `openai.ts`.
- [ ] Orçamento padrão de 25 s, com `AbortController`. Erro, timeout ou 429 de crédito viram `{ indisponivel: true, motivo }` e nunca lançam exceção.
- [ ] Cada volta chama `registrarConsumoDaIa({ finalidade: "comando", quemPaga }, { modelo, tokensEntrada, tokensSaida })`.
- [ ] Testes com `fetch` falso:
  - resposta direta sem ferramenta;
  - uma chamada de ferramenta e a resposta final;
  - teto de 4 voltas;
  - timeout vira indisponível;
  - 429 "no credits" vira indisponível;
  - o consumo é registrado por volta.

### Task 5: Catálogo de ferramentas, ondas, proposta e "sim"

**Files:**
- Create: `src/lib/central/ferramentas.ts`, `src/lib/central/proposta.ts`, `src/lib/central/proposta.test.ts`, `src/lib/central/ferramentas.test.ts`

- [ ] `FERRAMENTAS`: as 33 capacidades da spec (seções 3.1 a 3.7). Cada uma tem:
  - `nome`;
  - `descricao` em português, para o modelo;
  - `parametros` em JSON Schema;
  - `tipo` ("consulta" | "acao");
  - `onda` (0 | 1 | 2 | 3);
  - `soGestor?`.

  O gestor-só (13, 26, 27, 28, 30, reunião de 21) não é oferecido a quem é corretor.
- [ ] `executarFerramenta(contexto, nome, args)`: se `onda > ONDA_ATUAL` (constante 0 nesta entrega), devolve `{ aindaNao: true }` e a IA responde "Ainda não sei fazer isso, chega nas próximas semanas" (spec 3.0). Nesta onda só existe o tratador de `ajuda` (19), que lista o que já funciona e dá exemplos.
- [ ] `proposta.ts` (puro): `criarProposta`, `responderAProposta(texto)`, `expirou(agora)`.
  - "sim", "pode", "confirmo" confirmam;
  - "não" cancela;
  - correção ("não, é 6 mil") refaz a proposta;
  - outro pedido cancela;
  - o prazo é de 1 h.

  Reusar `lerRespostaCurta` (`src/lib/agenda/comandos/respostasCurtas.ts`).
- [ ] Testes de `proposta.ts`, com uma ferramenta de ação falsa:
  - "sim" aos 45 min confirma;
  - aos 61 min já expirou;
  - correção refaz;
  - outro pedido cancela;
  - pedido composto gera uma proposta com os itens numerados.
- [ ] Guardas de código em `ferramentas.test.ts`:
  - os 33 nomes estão lá, cada um com `onda`;
  - nenhum tratador de ação existe com `onda <= ONDA_ATUAL` nesta entrega;
  - `src/lib/central/` não chama `.insert(`/`.update(`/`.delete(` em `leads`, `visitas`, `whatsapp_conversas` ou `whatsapp_mensagens`.

### Task 6: A conversa do central (orquestração com dependências injetadas)

**Files:** `src/lib/central/conversa.ts`, `src/lib/central/conversa.test.ts`

- [ ] `responderNoCentral(entrada, deps)`, no molde de `responderAoCorretor` (`src/lib/agenda/comandos/conversa.ts`), sem rede direta. A ordem:
  1. Deduplicar por `mensagem_id`.
  2. `identificarRemetente`: desconhecido, inativo ou desligado registram em `central_tentativas` e não respondem; "escolher" pergunta "Por qual imobiliária?" com as opções numeradas.
  3. Cota (`lerCotaDaIa`/`grupoSuspenso`) esgotada responde a frase de cota.
  4. Primeira mensagem (`boas_vindas_em` nulo): boas-vindas com nome, imobiliária e três exemplos.
  5. Áudio: `baixarMidiaDoProvedor` + `transcreverAudioWhatsapp` (`quemPaga` = corretor e grupo). Se a transcrição falhar: "Não consegui ouvir o áudio, pode mandar de novo ou escrever?"
  6. Imagem: "Ainda não sei ler foto, chega nas próximas semanas."
  7. Histórico dos últimos 30 min, depois `pensar` com o sistema (nome, papel, imobiliária, data e hora de SP, as regras da spec 3.0) e as ferramentas da Task 5.
  8. Responder, atualizar `central_estado` e gravar `central_comandos` (texto, ferramentas, custo, latência).
  9. Com `indisponivel`: "Estou indisponível agora; tente de novo em alguns minutos." Também registra.
- [ ] Testes, com todas as dependências falsas:
  - cada desvio do passo 2 (incluindo que a tentativa NÃO guarda o texto);
  - cota esgotada;
  - boas-vindas só na primeira vez;
  - áudio transcrito chega ao cérebro como texto;
  - foto;
  - pedido de onda futura responde "ainda não";
  - indisponível;
  - reentrega da mesma `mensagem_id` não responde duas vezes.

### Task 7: Webhook — desvio da instância da plataforma

**Files:**
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (logo depois de ler `instanceName`, ~:268)
- Create: `src/lib/central/webhook.ts`

- [ ] `if (await ehInstanciaDoCentral(instanceName)) return tratarWebhookDoCentral(req, payload)`, antes do bloco de grupo, porque `resolverInstancia` devolveria `null` e a mensagem levaria 404.
- [ ] `tratarWebhookDoCentral`:
  - autentica com o segredo global (`WHATSAPP_WEBHOOK_SECRET`, mesma regra de `requisicaoAutenticada`, ~:223-247);
  - `connection.update` atualiza `central_da_plataforma.status_conexao`/`conectado_em`;
  - `messages.upsert` privado e não `fromMe` chama `responderNoCentral`;
  - grupo e broadcast são ignorados nesta onda;
  - casa por número **e** por `@lid` (o privado de hoje só faz `replace(/\D/g,"")` no JID).
- [ ] Envio das respostas: `enviarMensagemWhatsapp({ instanceName: <central>, ... })`. A resposta chega à instância do corretor como entrada do número central e é ignorada pela Task 2.
- [ ] Mapa de `servicoComGrupo.test.ts`: `src/lib/central/*` como `helper` ou `plataforma`, com motivo. O contexto vem de `identificarRemetente`.
- [ ] Testes: guarda de código (o desvio vem antes de `resolverInstancia(` no `route.ts`) e um teste do webhook com `fetch` falso da Evolution: mensagem privada de corretor reconhecido recebe resposta, mensagem de grupo é ignorada.

### Task 8: Conectar o número e as telas

**Files:**
- Plataforma: `src/app/plataforma/central/page.tsx` + `acoes.ts` (só admin da plataforma, `exigirAdminDaPlataformaNaPagina`/`NaAcao` de `src/lib/guardas.ts`)
- Gestor: `src/app/corretor/(painel)/admin/whatsapp/page.tsx` (seção nova antes de "Números da equipe", ~:161) e `acoes.ts` (molde de `configurarConfirmacaoAutomatica`, ~:142-163)
- Corretor: `src/app/corretor/(painel)/whatsapp/page.tsx` (bloco antes de `<WhatsappManager>`, ~:112)

- [ ] Plataforma, "Número central":
  - status de conexão e botão "Gerar código de conexão", que faz `garantirInstancia` + `obterQrCodeInstancia(instanceName, "5511968671127")` (`src/lib/whatsapp/provider.ts:77-125`, `:275`);
  - a primeira conexão grava a linha em `central_da_plataforma`;
  - mostra o código de pareamento, como a tela do corretor.
- [ ] Gestor: chave "Comandos pelo WhatsApp", que liga ou desliga `grupos.central_whatsapp_ativo`. Na lista "Números da equipe", o número que o central reconhece de cada pessoa.
- [ ] Corretor:
  - com o recurso ligado: "Fale com o assistente da plataforma", com o link `https://wa.me/5511968671127?text=oi` e "o central reconhece você pelo número 11 9…" (`corretores.whatsapp` formatado);
  - com o recurso desligado: nada.
- [ ] Testes: ação do gestor recusa corretor (`exigirGestorNaAcao`); página da plataforma dá 404 para quem não é admin; o link usa o número da tabela, não um número fixo no código da tela.

### Task 9: Eval "frase → ferramenta" e escolha do modelo

**Files:** `eval/golden/central.json`, `scripts/eval/rodarEvalDoCentral.ts`, `package.json` (`"eval:central"`)

- [ ] 100 casos `{ id, papel, historico?, mensagem, ferramentaEsperada, argumentosEsperados? }` cobrindo as 33 capacidades. Fonte:
  - pedidos reais dos corretores, já transcritos, em `retornos_de_ligacao` e nas mensagens da agenda por WhatsApp, anonimizados (nome trocado, telefone falso);
  - frases que o dono escrever.

  Incluir erro de digitação, áudio transcrito, pedido composto e pedido de gestor feito por corretor (deve recusar).
- [ ] O script roda `pensar` com as declarações da Task 5 (sem executar nada). Mede o acerto da ferramenta, dos argumentos principais, a latência e o custo, por `--modelo`. `quemPaga: { semGrupo: "eval" }`.
- [ ] Rodar com pelo menos dois modelos de primeira linha e o econômico de hoje (`gpt-4.1-mini`). Registrar a tabela em `eval/resultados/` e escolher `CENTRAL_MODELO`. Critério: acerto ≥ 90% (spec 2), depois latência de texto ≤ 10 s, depois custo.

### Task 10: Aviso de queda do número do corretor pelo central

O número desconecta **do sistema** (Evolution), mas o WhatsApp continua no celular do corretor: a mensagem do central chega. Hoje `avisarQuedaSeNecessario` (`src/lib/whatsapp/avisoDeQueda.ts:207`), chamado a cada minuto pelo disparador (`varrerQuedasDeNumero`, `campaignDispatcher.ts:240`), manda **só e-mail**. Ele sai sem avisar quem não tem e-mail (~:236), e a marca `aviso_queda_enviado_em` garante um aviso por queda.

**Files:**
- Modify: `src/lib/whatsapp/avisoDeQueda.ts`
- Create: `src/lib/central/avisoDeQuedaPeloCentral.ts`, `src/lib/central/avisoDeQuedaPeloCentral.test.ts`

- [ ] `montarWhatsappDeQueda(aviso, { nome, urlPainel })` (puro): mensagem curta, a partir do mesmo `aviso` de `avaliarSaudeDaConexao` que monta o e-mail. Diz:
  - a hora da queda (SP);
  - o que para enquanto estiver fora: a IA não atende os clientes e as listas ficam paradas;
  - o passo para reconectar, com o link da tela WhatsApp do painel.

  Quando `motivo_queda_codigo` é 401 (o WhatsApp tirou o aparelho), a mensagem diz isso e orienta: "se recusar, espere algumas horas e tente de novo".
- [ ] `avisarPeloCentral(corretorId, texto)`: manda pelo central para `corretores.whatsapp`. Só envia se três condições valem:
  1. o central está `conectado` (`central_da_plataforma`);
  2. o grupo do corretor tem `central_whatsapp_ativo`;
  3. o corretor está `ativo`.

  Devolve `{ enviado }` e nunca lança. Nunca usa a instância do corretor.
- [ ] Em `avisarQuedaSeNecessario`:
  - depois de `aviso.mereceEmail`, tentar os dois canais: e-mail (se houver) e central;
  - **gravar a marca quando pelo menos um saiu**;
  - corretor sem e-mail deixa de sair cedo: o central pode avisar;
  - se nenhum canal sair, não marca, para tentar de novo no próximo minuto, como hoje.
- [ ] Ao reconectar, se tinha havido aviso, o central manda "Seu WhatsApp voltou a conectar, está tudo funcionando" [minha]. Isso no ponto em que a marca de queda é zerada (`registrarEventoConexao`).
- [ ] Testes:
  - texto por motivo (401 e queda comum), com hora em SP;
  - central desconectado: só e-mail;
  - recurso desligado no grupo: só e-mail;
  - sem e-mail e com central: avisa pelo central e marca;
  - nenhum canal saiu: não marca;
  - a marca impede o segundo aviso na mesma queda;
  - guarda de código: `avisarPeloCentral` só usa o `instance_name` de `central_da_plataforma`.

### Task 11: Retenção e verificação final

- [ ] Retenção: no cron diário existente, apagar `central_comandos.texto` com mais de 30 dias (os números ficam) e `central_tentativas` com mais de 30 dias. Teste da função pura que monta o corte.
- [ ] `npx tsc --noEmit -p .`, `npx vitest run --dir src`, `node scripts/lintTeto.mjs`, `npx next build`, `node scripts/bundleTeto.mjs`.
- [ ] Migration 0249 aplicada em produção antes do deploy. Variável `CENTRAL_MODELO` cadastrada na Vercel.
- [ ] Ponta a ponta com o chip real, depois do deploy:
  1. conectar o 11 96867-1127 pela tela da plataforma;
  2. ligar o recurso na Next Home;
  3. um corretor da Next Home manda "oi": recebe boas-vindas com o nome;
  4. áudio "o que você sabe fazer?": responde a ajuda;
  5. "cadastra o João, 11 9…": "ainda não sei fazer isso";
  6. foto: "ainda não sei ler foto";
  7. número de fora: nenhuma resposta, só uma linha em `central_tentativas` sem texto;
  8. na instância do corretor, **nenhum lead, conversa ou resposta de IA** foi criado para o número central (conferir `whatsapp_conversas` e `leads` pelo telefone do central);
  9. queda: desconectar o número de um corretor de teste da Next Home (logout pela tela dele). Dentro do tempo de `avaliarSaudeDaConexao`, chega a mensagem do central no celular, uma vez só. Reconectar: chega o "voltou a conectar".
- [ ] Vault: nota de implementação ligada a `[[crm-pelo-whatsapp-numero-central-com-ia]]`, MOC "IA e Atendimento", `docs/MEMORIA.md`. Atualizar `vault/30-arquitetura/fluxo-do-webhook-whatsapp.md` com o desvio do central e o filtro do laço.

## Depois desta onda

A onda 1 troca o tratador "ainda não" das capacidades 1, 2, 3, 4, 6, 7, 18, 19 (desfazer) e 21 por tratadores de verdade, com proposta e "sim" (Task 5). Ela também passa a agenda por mensagem de hoje para o central (spec 5). O eval da Task 9 é rodado a cada onda para vigiar regressão.
