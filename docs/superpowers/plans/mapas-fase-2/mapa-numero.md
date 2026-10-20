# Fase 2 — mapa factual: um número em um grupo só, teto por corretor, vazão da OpenAI

> **Numeração (20/10/2026):** este documento foi escrito com a numeração antiga. A fase 1 (0181–0185) virou **0190–0194** (0181→0190, 0182→0191, 0183→0192, 0184→0193, 0185→0194) e a fase 2 (0186, 0187) virou **0195** e **0196**. Os números abaixo, inclusive as referências `arquivo:linha`, são os antigos.

Branch `fase-1-multi-grupo`, lido em 19/10/2026. Só leitura. Caminhos relativos a
`C:/Users/User/nexthome/next-home`.

Base no desenho (`docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`):
- §5 l.74-87: número pessoal pela Evolution; anti-ban vale para todos.
- §10 l.204-241: medidor único com reserva atômica; Imobiliária soma cotas na equipe.
- §18 Fase 2 l.477-479 (vazão OpenAI), l.487 (teto por corretor), l.489-490 (mesmo número em dois grupos).
- §19 resposta 4 l.603-606: **proibido**; trava no banco, número único entre instâncias de todos os grupos, recusa com explicação.

---

## 1. A tabela `corretor_whatsapp_instancias`

### Colunas (todas as migrations)
| coluna | origem |
|---|---|
| id, corretor_id (**unique**, cascade), instance_name (**unique**), status_conexao (`desconectado/conectando/conectado`), **telefone_conectado text (sem unique, sem índice, sem normalização)**, qrcode_base64, modo_bot, nome_assistente, tom_voz, webhook_secret, created_at, updated_at | `supabase/migrations/0018_whatsapp_multi_instancias.sql:5-18` |
| conectado_em, envios_campanha_data, envios_campanha_contador, falhas_seguidas, bloqueado_ate | `0020_whatsapp_anti_ban.sql:9-17` |
| palavra_chave_ativacao | `0023:18-22` |
| palavra_chave_teste | `0039:25-26` |
| palavras_entrada_cliente | `0056:24-25` |
| proximo_envio_permitido_em | `0062_espacamento_no_envio.sql:56-57` |
| desconectado_em, aviso_queda_enviado_em | `0071:41-43` |
| expediente_inicio/fim (+check) | `0148:17-24` |
| regras_da_ia (+check tamanho) | `0154:18-24` |
| motivo_queda_codigo, motivo_queda_em, sessao_caida_em, queda_tratada_em, aquecimento_desde | `0174:36-41` |
| grupo_id (carimbo pelo corretor: `corretor_id → corretores`) | `0182_grupo_em_todas_as_tabelas.sql:71`, gatilhos genéricos `0182:681-708` |

Índices existentes: `idx_corretor_instancia_corretor`, `idx_corretor_instancia_name` (`0018:95-96`). **Não há índice nem
restrição em `telefone_conectado`.** Hoje nada impede o mesmo número em duas instâncias, nem dentro do mesmo grupo.

### Privilégios
`0175_estado_do_numero_so_o_servidor_escreve.sql:36-52`: `anon` sem nada; `authenticated` só SELECT + UPDATE por coluna
(nome_assistente, tom_voz, modo_bot, palavras-chave, frases, expediente, regras_da_ia, updated_at). Estado da conexão
(status, telefone_conectado, conectado_em, contadores) **só a chave de serviço escreve**. Coluna nova para a trava
(ex.: telefone normalizado) não pode entrar nesse grant.

### Uma instância por corretor
`corretor_id unique` (`0018:7`); upsert `onConflict: "corretor_id"` (`src/app/corretor/(painel)/whatsapp/acoes.ts:231-233`,
`:318-334`). Nome da instância = `nexthome-${slug}` (`whatsapp/acoes.ts:31-33`), slug é global hoje; fase 3 prevê
instância identificada por id (spec l.503-504).

---

## 2. Onde o número é gravado (os três caminhos + a limpeza)

O número **só passa a existir na linha quando o provedor confirma a conexão**. O número que o corretor digita no
pareamento por código NÃO é gravado.

| caminho | o que grava | arquivo:linha |
|---|---|---|
| Botão Conectar (`conectarWhatsapp`) | upsert status `conectado`/`conectando`, qrcode; carimba `conectado_em` se nulo. **Não grava telefone.** O número digitado vai só para a Evolution (`?number=`) | `whatsapp/acoes.ts:289-364` (normaliza em `:300`, pede QR/código `:306`, upsert `:318-334`, carimbo `:348-354`) |
| Webhook `connection.update` | `registrarEventoConexao` com `telefone = (data.wuid \|\| data.owner).replace(/\D/g,"")` | `src/app/api/webhooks/whatsapp/route.ts:344-357` → `src/lib/whatsapp/repositorio.ts:2660-2742` (grava `telefone_conectado` só se `open` e telefone presente, `:2694`) |
| Sincronização ativa (polling 5s da tela, disparador, cron) | `sincronizarConexaoInstancia` lê `/instance/connectionState` (`owner \|\| wuid`, só dígitos) e grava `telefone_conectado` | `repositorio.ts:2558-2643` (gravação `:2608-2631`); provedor `src/lib/whatsapp/provider.ts:398-437` (telefone `:421-432`); chamada pela tela em `whatsapp/acoes.ts:378-423` |
| Desconectar (corretor) | `telefone_conectado: null`, `conectado_em: null`, status desconectado | `whatsapp/acoes.ts:437-465` (`:449-458`) |
| Desconectar (ADM do grupo) | idem, filtrado por `grupo_id`; registra `admin_eventos` | `src/app/corretor/(painel)/admin/whatsapp/acoes.ts:24-66` |

Fatos que importam para a trava:
- **Queda NÃO limpa `telefone_conectado`**: `registrarEventoConexao` em `close` só muda status/carimbos (`repositorio.ts:2686-2731`);
  `sincronizarConexaoInstancia` desconectado idem (`:2580-2599`). Só o desconectar manual zera. Logo, linha com
  `status_conexao='desconectado'` e `telefone_conectado` preenchido é estado normal.
- **As gravações não conferem erro**: `registrarEventoConexao` faz `.update(...)` sem ler `error` (`:2686-2708`);
  `sincronizarConexaoInstancia` também (`:2608-2631`). Uma violação de índice único hoje viraria falha CALADA
  (status ficaria `conectando`, número fisicamente pareado).
- **Desativar corretor não desconecta o número** (`admin/acoes.ts:441-478` só muda `ativo`). Um número de quem foi
  desativado continua `conectado` na linha.
- Troca de chip dentro da MESMA instância zera reputação: `src/lib/whatsapp/trocaDeNumero.ts:45-67`
  (`mesmoNumero` compara só dígitos `:22-28`; número vazio ou primeira conexão não é troca).
- Pareamento por código: decisão pelo estado da Evolution em `src/lib/whatsapp/pareamento.ts:27-40`;
  `obterQrCodeInstancia` em `provider.ts:222-279` (normaliza com `normalizarTelefoneBr`, `:237`; faz logout em
  `connecting`, `:263`).

### Formato do número
- Gravado só com dígitos, a partir do JID da Evolution (`wuid`/`owner`). Ex.: `5511999998888`.
- **Não há normalização BR** (DDI/9º dígito) no que é gravado. Existem prontos: `normalizarTelefoneBr`
  (`src/lib/whatsapp/telefone.ts:38`), `candidatosTelefone` com variante do 9º dígito (`repositorio.ts:234-249`) e a
  função SQL `public.normalizar_telefone_br` (`0022_ingestao_leads.sql:20`, já usada em coluna gerada de `leads`).
- Hipótese não conferida: se `wuid` vier com sufixo de aparelho (`5511...:12@s.whatsapp.net`), o `replace(/\D/g,"")`
  concatenaria o `12`. Não há teste nem dado medido sobre o formato real nesta instalação.

### Quem LÊ o número (afetados por qualquer mudança de semântica)
`numeroDoLinkPessoal.ts:20-24` (só se `status='conectado'`), `sortear_corretor_whatsapp(p_grupo,…)`
(`0183_funcoes_respeitam_grupo.sql:891-934`, exige `status='conectado'` e `telefone_conectado is not null`),
`campanhas/acoes.ts:1239,1367`, `campaignDispatcher.ts:265`, `admin/whatsapp/page.tsx:78,166`,
`whatsapp/acoes.ts:389-421,482-495`, `whatsapp/page.tsx:24,97`, `0180_conta_so_whatsapp.sql:189-198`.

---

## 3. Anti-ban: tudo contado por INSTÂNCIA

| peça | arquivo:linha |
|---|---|
| Reserva atômica (cota do dia + espaçamento + bloqueio) — `consumir_cota_campanha_espacada(p_instancia_id, p_limite, min, max)`, `security definer`, update condicional + insert em `whatsapp_envios_por_dia` na mesma transação | última definição `0158_aquecimento_pelo_uso.sql:65-143` |
| Devolução — `devolver_cota_campanha(p_instancia_id)` | `0158:145-169` |
| Histórico por dia — `whatsapp_envios_por_dia (instancia_id, dia)` PK | `0158:16-21` (grupo herdado de instância, `0182:140-142`) |
| Wrapper TS `reservarCotaCampanha(instanciaId, conectadoEm)` (falha ao perguntar = recusa) | `src/lib/whatsapp/repositorio.ts:1989-2075` |
| Limite do dia pelo uso (maior dia dos últimos 7 × 1,5, piso 15, teto pela idade, freio por recusas) | `calcularLimiteDoDia` `repositorio.ts:1931-1964`; `instanciaParaOLimite` `:1971-1987` |
| `devolverCotaCampanha` | `repositorio.ts:2093-2100` |
| Chamadores (todo envio por iniciativa nossa) | `campaignDispatcher.ts:719`, `api/cron/followups/route.ts:884`, `aberturaPelaIA.ts:129,358` |
| Tela usa a mesma conta | `campanhas/acoes.ts:1295-1298` |
| Registro das funções seguras (só service_role) | `src/lib/grupos/funcoesSeguras.ts:47-50` |

Consequências factuais para a fase 2:
- Com a proibição (§19.4), contar por instância continua correto **enquanto o número estiver em uma instância só**.
- **Lacuna residual**: o histórico e o contador moram em `instancia_id`. Desconectar no grupo A e conectar no grupo B
  (instância nova) no mesmo dia começa do zero (`conectado_em` novo → curva por idade + piso 15). Proibir só a
  simultaneidade não cobre o "salto" no mesmo dia; o volume do dia em A não é visto em B. (Do lado conservador para a
  curva, mas o piso de 15 sai de novo.)
- Dedup de mensagem é por grupo desde a 0183: `(grupo_id, provider_message_id)` (`0183:40,120-121`; antes global,
  `0027_whatsapp_dedup.sql:11-13`). Com o mesmo número em duas instâncias do MESMO grupo, a segunda entrega da mesma
  mensagem cai como "reentrega" e a segunda conversa fica sem a fala; em grupos diferentes, entraria nos dois.

---

## 4. Onde a fase 2 encaixa — "um número, um grupo"

Não existe hoje (precisa ser criado):
1. **Restrição no banco** sobre o número conectado entre TODAS as instâncias (todos os grupos). Precedentes de
   unicidade global com resposta sim/não: `slug_de_corretor_livre`, `slug_de_imovel_livre`, `email_de_acesso_livre`
   (`funcoesSeguras.ts:29-37`). Escolhas que o construtor terá de fixar, com os fatos acima:
   - escopo: `telefone_conectado is not null` (bloqueia número de quem caiu e não desconectou, ver §2) ou
     `status_conexao='conectado'` (a reconexão de A violaria depois que B conectou);
   - normalização da chave (coluna gerada com `normalizar_telefone_br`, ou o par com/sem 9º dígito de
     `candidatosTelefone`) — hoje o valor é cru do JID;
   - a coluna/índice novo fica FORA do grant da 0175 (`0175:41-52`);
   - backfill: conferir duplicados existentes antes de criar índice (não há dado medido aqui; consultar
     `select telefone_conectado, count(*) … group by 1 having count(*)>1`).
2. **Recusa nos dois momentos possíveis**:
   - *antes* (só no pareamento por código, onde o número é conhecido): `whatsapp/acoes.ts:300-306`, antes de
     `obterQrCodeInstancia`;
   - *na confirmação* (QR e código): `registrarEventoConexao` (`repositorio.ts:2686`) e
     `sincronizarConexaoInstancia` (`:2608`) precisam ler o erro de violação (23505) — hoje ignoram — e derrubar a
     sessão na Evolution (`desconectarInstancia`, `provider.ts:349`), senão o número fica pareado e respondendo pelo
     webhook sem estado `conectado`.
   - *a explicação ao corretor* chega pela tela via `verificarConexaoWhatsapp` (`whatsapp/acoes.ts:378-423`, polling),
     cujo retorno hoje é `{conectado, estado, telefone}` — não tem campo de recusa.
3. **Ordem de deploy**: código antigo grava `telefone_conectado` sem tratar erro; índice aplicado antes do código
   novo transforma a violação em falha calada. Mesma família do aviso da 0175 ("aplicar DEPOIS do deploy") e da
   0062/0063 (endurecer o caminho que a produção ainda chama).
4. **Guardas**: função nova `security definer` precisa entrar em `FUNCOES_SEM_GRUPO` com motivo
   (`funcoesSeguras.ts`), verificada por `funcoesSeguras.test.ts` / `.db.test.ts`; tabela nova revoga `anon` e
   `authenticated` (`tabelasSeguras.test.ts`, MEMORIA 0116).
5. Itens vizinhos da mesma seção da fase 2 que tocam este fluxo: **aceite de termos antes de conectar** (spec l.488;
   não há tabela/coluna de aceite hoje) e **ponto único "pode operar"** (spec l.470-472;
   `resolverInstancia` em `repositorio.ts:87-124`).

---

## 5. Teto por corretor (dentro da cota somada da equipe)

**Não existe medidor por grupo nem plano** (`grupos` tem só id, nome, slug, tipo, criado_em —
`0181_grupos.sql:56-62`; nenhuma coluna `situacao`, `plano`, cota). Os medidores que existem são por corretor ou por
instância, cada um com regra própria:

| ferramenta | unidade | como conta | arquivo:linha | nota |
|---|---|---|---|---|
| Artes de IA | corretor/dia, `TETO_DIARIO = 20` | `count(*)` em `imagens_geradas` desde o início do dia SP, **depois** gera | `src/lib/imagens/imagensTipos.ts:20`, `galeria.ts:150-159`, checagem `api/imagens/gerar/route.ts:93-99` | conta-e-depois-insere (não atômico); linhas expiram em 48h (`0109`), então não serve para cota MENSAL (spec l.476: "não depende de linha que expira") |
| Vídeos | corretor/mês, `video_creditos.cota_mensal` default 5 + avulsos | `reservar_credito_video(p_corretor)` atômico, ciclo no fuso SP | `0092_video_jobs.sql:73-180`; `src/lib/video/fila.ts:80,133` | é o padrão "reserva antes de gastar" que o §10 cita |
| Mensagens de lista | instância/dia (anti-ban) | `consumir_cota_campanha_espacada` | §3 acima | é segurança do número, não cota do plano (spec l.228-229: a tela mostra os dois) |
| Respostas da IA, dossiê, transcrição, leituras | — | **sem contador**; só telemetria `ia_interacoes.tokens_entrada/tokens_saida` (`0029_ia_telemetria.sql:27-28`) | — | nem todo chamador grava telemetria (ver §6) |

Para "teto por corretor dentro da cota somada", hoje não há: tabela de uso por grupo/mês, coluna de teto por corretor,
função de reserva que confira os dois níveis (grupo e corretor) na mesma transação.

---

## 6. Vazão da OpenAI

### Uma chave para tudo
`OPENAI_API_KEY` é lida diretamente em seis lugares, todos a mesma variável:
| uso | arquivo:linha | passa por `llm.ts`? |
|---|---|---|
| texto (cascata, motor único `gpt-4.1-mini`) | `src/lib/whatsapp/openai.ts:45-47`; `llm.ts:174-195` (`ordemDosProvedores`), `:209-322` (`chamarLlmJson`) | sim |
| transcrição de áudio (`gpt-4o-mini-transcribe`) | `src/lib/whatsapp/audioTranscriber.ts:188-215` | não |
| imagem (`gpt-image-2`) | `src/lib/imagens/gerarImagem.ts:115-123` | não |
| leitura de planta | `src/lib/imoveis/lerPlanta.ts:185` | não |
| classificação de fotos do vídeo | `src/lib/video/classificarFotos.ts:58,69` | não |
| scripts de eval/bench | `scripts/eval/compararModelos.ts:71`, `scripts/imagens/medirF0.ts:101`; juiz via `chamarOpenaiJson` em `rodarEval.ts:159`, `rodarConversa.ts:226`, `julgarComGpt.ts:59`, `analiseDeErros.ts:56`, `testarJuizRestricao.ts:84` | parte |

`.env.example:231`: "Usa a MESMA OPENAI_API_KEY do motor de texto — não há chave separada." Os scripts de eval
(`package.json:16-31`, `tsx --conditions=react-server`) leem o `.env.local` exportado: a mesma chave do atendimento.
Nenhum workflow do GitHub recebe chave da OpenAI (`.github/workflows/*.yml` só têm Supabase e E2E).

### Chamadores de `chamarLlmJson`, por natureza (para a prioridade atendimento > lote > eval)
- **Atendimento (cliente esperando)**: `aiAgent.ts:740` (webhook), `audioTranscriber` via webhook `route.ts:600`,
  `classificarRecusa.ts:42`, `dossierExtractor.ts:161` (depois da resposta, `fatia: 1`).
- **Interativo do painel (corretor esperando)**: `consultor/turno.ts:119`, `estudio/turno.ts:384`,
  `imagens/tradutor.ts:254`, `imagens/engenheiroDePrompt.ts:152`, `imoveis/actions.ts:747` (descrição),
  `financeiro/assistente/acoes.ts:46`, `campanhas/acoes.ts:357`, `api/imagens/gerar/route.ts:157`.
- **Lote**: `whatsapp/campaignQueue.ts:167` (variação por envio), `leads/leituraPorIa.ts:182` (`EM_PARALELO = 4`,
  `:66,190`), `precos/leituraPorIa.ts:190,298` (`EM_PARALELO = 6`, `:60,182-198`), `leads/importacao.ts:1101`,
  `imoveis/rascunhoDePdf.ts:185`, `inbound/aiParser.ts:40` (e-mail de portal), `whatsapp/importarHistorico.ts:77`
  (transcrição em lote), `importar/acoes.ts:273,885` (planta), `marketing/video/acoes.ts:125,147`.
- **Eval**: os scripts acima.

Nenhum desses carrega rótulo de prioridade/origem até `chamarLlmJson` (`llm.ts:209-231` só aceita temperature,
orcamentoMs, imagens, detalheImagem, fatia). Não há fila, semáforo, rate-limiter nem orçamento de TPM no código.

### Como o erro de vazão chega hoje
- `motivoDoStatus` mapeia **todo 429** para `http_429` (`src/lib/whatsapp/llmTipos.ts:34-35`): limite de TPM e
  **crédito esgotado (`insufficient_quota`) são o mesmo motivo** no texto. Só a imagem separa `sem_credito`
  (`gerarImagem.ts:171-188`).
- 429 não é retentado na mesma chave (`llm.ts:286-299`, `valeRetentar`); com motor único cai em contingência
  (`aiAgent.ts:663` `textoDeContingencia`).
- **Textos que mandam o corretor resolver a conta** (o que a spec l.478-479 proíbe):
  `api/imagens/gerar/route.ts:293-294` ("A conta de IA está sem crédito. Recarregue…");
  `whatsapp/_componentes/PlaygroundIA.tsx:46-50` ("Confira o saldo e o limite da conta da OpenAI", "Confira a
  OPENAI_API_KEY").
- Não existe aviso à plataforma de crédito acabando (nenhum alerta; spec "Operação" l.568 também lista).
- Tokens: `openai.ts:172-173` devolve `prompt_tokens`/`completion_tokens`; não lê `cached_tokens`
  (`usage.prompt_tokens_details`), que a spec §10 l.226 e §15 l.340-342 querem medir antes do preço.

### Armadilhas da MEMORIA para este assunto
- TPM de 200k no `gpt-4.1-mini` com prompt ~10k tokens ≈ 20 respostas/min; o eval usa a mesma chave e oito
  simulações em paralelo mataram nove conversas com 429 (seção "Eval de 28/09 e a v41").
- Sem crédito, a Sofia cai junto com imagem e consultor (02/09; `consultor/turno.ts:38`, seção "Quanto custa uma imagem").
- Benchmark/eval com a chave de produção consome a cota do atendimento real (seção do Gemini, regra geral).
- Comentário desatualizado: `openai.ts:5-19` ainda diz "ÚNICO provedor PAGO … por último"; desde 24/08 é o motor
  único. Texto desatualizado é o defeito recorrente nº 5.

---

## 7. Armadilhas gerais (MEMORIA) que valem aqui
- 0175: estado do número só pelo servidor; nova coluna não entra no grant do `authenticated`.
- 0062/0063: ao endurecer defeito de segurança numa função do banco, endurecer também a versão que a produção ainda chama.
- 0158/0174/0176: aquecimento pelo uso e recomeço após queda; reset por troca de chip só dentro da instância.
- `conectado_em` nulo trava toda campanha ("número ainda não foi pareado"), então um caminho de recusa não pode
  carimbar `conectado_em` para a instância recusada.
- Migration: próxima livre na branch é 0186; produção (`origin/claude/modernizar-…`) está em 0180 — conferir antes de
  numerar (colisão já aconteceu três vezes).
- `list_migrations` do Supabase não serve para saber o que está aplicado; conferir objetos.
