# Fase 2 — mapa factual: medidor, cotas, Storage, contingência

Branch `fase-1-multi-grupo` (HEAD 334c337). Só leitura. Spec: §10 (medidor
único, reserva atômica antes de gastar, mês em SP, aviso 80%, IA para e avisa
ao acabar), §18 Fase 2 ("medidor cobre toda chamada paga… grava tokens por
grupo e não depende de linha que expira"; "vazão da OpenAI"; "armazenamento
por grupo").

---

## 1. O caminho único de texto: `src/lib/whatsapp/llm.ts`

- `chamarLlmJson(prompt, opts)` — `llm.ts:209`. Monta a lista de provedores
  (`ordemDosProvedores`, `:174`; motor único = OpenAI, `MOTOR = "openai"`),
  filtra por chave/`cabe`/`leImagem` (`:238-245`), uma retentativa só para
  5xx/vazia/desconhecido (`valeRetentar`, `llmTipos.ts:48`).
- Resultado tipado `ResultadoLlm` (`llmTipos.ts:21-31`): em sucesso já traz
  `tokensEntrada`, `tokensSaida`, `modelo`, `latenciaMs`. Adaptadores lêem o
  `usage`: `openai.ts:175-176`, `groq.ts:186`, `nvidia.ts:143`,
  `gemini.ts:123`.
- **Não recebe grupo, corretor nem "origem"**: o medidor não tem onde se
  pendurar hoje sem mudar a assinatura (ou embrulhar por fora).
- Falha: `MotivoFalhaLlm` (`llmTipos.ts:11-19`) — `sem_api_key | timeout |
  http_4xx | http_429 | http_5xx | resposta_vazia | json_invalido |
  desconhecido`. `motivoDoStatus` (`llmTipos.ts:34`) só olha o status:
  **crédito esgotado da OpenAI (HTTP 429 `insufficient_quota` /
  `credit_balance_exhausted`) vira `http_429`, indistinguível de rate-limit.**
  O corpo do erro só vai em `detalhe` (texto, `openai.ts:149-154`).
- Chave: uma só, `OPENAI_API_KEY` (`openai.ts:46`), lida também por
  `gerarImagem.ts`, `lerPlanta.ts`, `classificarFotos.ts`,
  `audioTranscriber.ts` e pelos scripts de eval (`scripts/eval/*` via
  `chamarOpenaiJson`) e `scripts/imagens/medirF0.ts`. **Não existe chave
  separada para testes nem prioridade (atendimento > lote > eval).**

## 2. Inventário de toda chamada paga (arquivo:linha) e se registra tokens

Legenda: **T** = tokens chegam a `ia_interacoes`; **—** = tokens descartados
(o `ResultadoLlm` os tem, ninguém grava); **D** = fetch direto, fora do
`llm.ts`.

### Atendimento WhatsApp
| Chamada | Onde chama o modelo | Quem chama | Tokens |
|---|---|---|---|
| Resposta do agente | `aiAgent.ts:740` (`gerarRespostaIA`, `:674`) | `turnoDeAtendimento.ts:454`; webhook grava em `route.ts:1521-1536` | **T** (webhook, `whatsapp/acoes.ts:110` playground) |
| Refazer resposta "eco" (2ª chamada) | `turnoDeAtendimento.ts:536` | turno | **—** a meta da refeita é trocada pela da original (`:551` `meta: respostaBruta.meta`) → custo da 2ª chamada some |
| Dossiê | `dossierExtractor.ts:161` | webhook `route.ts:163`; playground `whatsapp/acoes.ts:116` | **—** |
| Classificar recusa | `classificarRecusa.ts:42` | webhook `route.ts:977`; turno `turnoDeAtendimento.ts:353` | **—** |
| Follow-up / lembrete | via `executarTurnoDeAtendimento` | `cron/followups/route.ts:540, 1081` (`registrarInteracao` sem tokens) | **—** |
| Abertura pela IA (palavra-chave/botão) | via turno | `aberturaPelaIA.ts:238` (`registrarInteracao` sem tokens) | **—** |
| Transcrição de áudio | OpenAI `audioTranscriber.ts:201` (`gpt-4o-mini-transcribe`, `:196`) → Groq `groqAudio.ts:74` → Gemini `audioTranscriber.ts:224` | `transcreverAudioWhatsapp` `:282`; webhook `route.ts:600`; `importarHistorico.ts:77` | **D**, sem registro algum; cobrado por minuto (duração vem em `segundos`, `:38`) |

### Listas de transmissão
| Variação por IA de cada envio | `campaignQueue.ts:167` (`variarSemRepetir`, `:124`) | disparador `campaignDispatcher.ts:630`; prévia `campaignQueue.ts:365` ← `exemplosDaLista` ← `campanhas/acoes.ts:265, 283` | **—** |
| Aberturas sugeridas | `campanhas/acoes.ts:357` (`sugerirAberturas`) | painel | **—** |

### Painel (assistentes)
| Consultor | `consultor/turno.ts:119` | `consultor/acoes.ts:122`, grava `:149-156` | **T** (origem `consultor`, `conversa_id` nulo) |
| IA do financeiro | `financeiro/assistente/acoes.ts:46` | grava `:48-73` | **T** (origem `financeiro`) |
| Estúdio: perguntas | `imagens/engenheiroDePrompt.ts:152` (`perguntarOQueFalta`) | `estudio/turno.ts:209` | **—** |
| Estúdio: tradutor (com visão, `detail` low) | `imagens/tradutor.ts:254` | `estudio/turno.ts:233` | **—** |
| Estúdio: entender pedido de vídeo | `estudio/turno.ts:384` | `turnoDeVideo` `:403` ← `estudio/acoes.ts:139` | **—** |
| Geração de imagem (`gpt-image-2`) | **D** `imagens/gerarImagem.ts:212-218` (`/images/edits` ou `/generations`) | `api/imagens/gerar/route.ts:157` | **—** o corpo `usage` é ignorado (`gerarImagem.ts:244-247` só lê `data`). Custo é por token de saída (MEMORIA 03/09) |
| Descrição do imóvel | `imoveis/actions.ts:747` | painel | **—** |
| Ler planta (visão) | **D** `imoveis/lerPlanta.ts:131, 192` | `imoveis/[slug]/importar/acoes.ts:273, 885` | **—** |
| Rascunho de imóvel (PDF/site) | `imoveis/rascunhoDePdf.ts:185` (`montarRascunhoDeTexto` `:179`) | `importar/acoes.ts:454, 694`; `imoveis/novo/acoes.ts:197` | **—** |
| Classificar fotos do vídeo (visão) | **D** `video/classificarFotos.ts:64` | `marketing/video/acoes.ts:125, 147` | **—** |
| Tabela de preços (texto, em pedaços) | `precos/leituraPorIa.ts:190` | `admin/precos/actions.ts:277` | **—** |
| Print da tabela (visão) | `precos/leituraPorIa.ts:298` (`transcreverPrintDaTabela`) | `admin/precos/actions.ts:395` | **—** |

### Leads / e-mail
| Lista sem cabeçalho | `leads/leituraPorIa.ts:182` (por pedaço) | `leads/importacao.ts:577` | **—** |
| Foto de lista | `leads/importacao.ts:1101` | `importar/actions.ts:275` | **—** |
| PDF/texto (Gemini direto) | **D** `leads/importacao.ts:488-499` (`chamarGemini`), chamado em `:628, :677, :1113` | importação | **—** |
| E-mail de portal / Gmail | `inbound/aiParser.ts:40` (`extrairVariosLeadsComIA`) | `inbound/processarEmail.ts:72` ← `api/webhooks/email-lead/route.ts:68` (grupo fixo `GRUPO_NEXT_HOME_ID`) e `inbound/gmailCaixa.ts:93`; também `importar/actions.ts:477` | **—** |

### Fora da Vercel / não-IA
- Render de vídeo: FFmpeg no GitHub Actions (`scripts/video/worker.ts`), sem
  API paga; custa minutos de Actions quando o repositório ficar privado (§19
  resposta 1).
- E-mail transacional: Resend `src/lib/email.ts:31` (sem chave hoje).
- Scripts de eval (`scripts/eval/rodarEval.ts:159`, `rodarConversa.ts:210,226`,
  `julgarComGpt.ts:59`, `analiseDeErros.ts:56`, `testarJuizRestricao.ts:84`)
  usam a MESMA `OPENAI_API_KEY` de produção.

**Resumo:** só 3 caminhos gravam tokens (agente no webhook/playground,
consultor, financeiro). Uns 20 outros pontos pagos não deixam rastro de
custo; 5 deles são `fetch` direto (imagem, planta, classificar fotos,
transcrição, Gemini da importação) e nem passam pelo `llm.ts`.

## 3. `ia_interacoes` (telemetria) — o que serve e o que não serve ao medidor

- Tabela: `0029_ia_telemetria.sql:10-31` — `tokens_entrada`,
  `tokens_saida` existem (`:27-28`), `modelo`, `latencia_ms`, `origem` com
  CHECK (última versão `0169_ia_do_financeiro.sql:11-12`: webhook, playground,
  followup, eval, painel, consultor, financeiro).
- Escrita: `registrarInteracao` `telemetria.ts:87-155` (cliente de serviço,
  fire-and-forget, devolve `{ok,erro}`). **Não manda `grupo_id`.**
- Grupo: a 0182 deriva `grupo_id` da mãe `conversa_id`
  (`0182_grupo_em_todas_as_tabelas.sql:87`); sem mãe → `grupo_atual()` → se
  houver 1 grupo infere, senão `raise exception 'grupo_id obrigatório'`
  (`0182:400-413`). **Armadilha:** consultor, financeiro, playground e eval
  gravam com `conversa_id` nulo pelo cliente de serviço (sem `auth.uid()`):
  com o 2º grupo criado, o insert passa a FALHAR (vira só log). Telemetria
  hoje não serve de medidor multi-grupo sem passar `grupo_id` explícito.
- Silêncios também são linhas (`modelo` nulo) — contar uso exige
  `modelo is not null` (MEMORIA: "filtrar por `acao = 'respondida'`"/"`modelo
  is not null`"). `e_teste` marca playground/eval (`telemetria.ts:106`).
- Retenção: `conversa_id on delete set null` (0029:12) — a linha sobrevive à
  exclusão do lead (bom para medir). Mas já houve `delete from
  ia_interacoes` em migration (`0111:139`) e a limpeza de 12/09 deixou 4.187
  órfãs: não é registro contábil, ninguém garante imutabilidade.
- Grants: corretor tem UPDATE só em `avaliacao`/`motivo_avaliacao` (0131);
  coluna nova pela sessão do corretor → "permission denied" (MEMORIA 29/09).

## 4. Medidores que já existem

### 4.1 Teto de imagens/dia (NÃO é atômico, NÃO é por grupo)
- `TETO_DIARIO = 20` — `imagens/imagensTipos.ts:20`; dia de SP
  `inicioDoDiaEmSaoPaulo` `:117`.
- `getTetoDeHoje(corretorId)` — `imagens/galeria.ts:148-158`: `count` em
  `imagens_geradas` por `corretor_id` desde o início do dia.
- Conferido em `api/imagens/gerar/route.ts:92-97` ANTES de gerar; a linha só
  nasce depois (`registrarImagem`, `route.ts:245`).
- Armadilhas:
  1. **Corrida**: contar → gerar → gravar. Dois pedidos simultâneos com 19
     usadas passam os dois.
  2. **Forjável para baixo**: `authenticated` tem DELETE em `imagens_geradas`
     (policy `0090:56-57`; action `criar-imagem/acoes.ts:14-25`). Apagar a
     arte devolve a vaga do dia.
  3. **Linha que expira**: `expira_em` 48h (`0109`), cron `imagens/limpeza.ts:61`
     apaga. Contagem mensal sobre esta tabela é impossível — é exatamente o
     "não depende de linha que expira" do §18.
  4. **Imagem paga sem linha**: se o upload ao Storage falha
     (`route.ts:219-239`), a imagem já foi cobrada e nada é contado.
  5. Mensagem de `sem_credito` manda o corretor "Recarregue" (`route.ts:293-294`)
     — o §18 proíbe ("nunca manda o corretor recarregar").
  6. `gerarImagem.ts:171-174` é o ÚNICO lugar que distingue crédito
     (`insufficient_quota`/`billing_hard_limit` → `sem_credito`).

### 4.2 Vídeo: `video_creditos` + `reservar_credito_video` (o modelo certo)
- Tabela `0092_video_jobs.sql:73-84`: `corretor_id` PK, `cota_mensal` (5),
  `usados_no_ciclo`, `ciclo_inicio` (SP), `creditos_avulsos`.
- `reservar_credito_video(p_corretor)` `0092:98-145`: `insert … on conflict`,
  `select … for update`, vira ciclo pelo mês de SP (`:116`), debita cota ou
  avulso, devolve `'cota'|'credito'|null`.
- `devolver_credito_video` `0092:153-175`: só devolve no ciclo corrente.
- Chamada: `video/fila.ts:133` (reserva antes do insert do job), devolução
  `:163` (job não nasceu) e `:279` (falha definitiva). Leitura de saldo
  `getSaldo` `fila.ts:77` (repete a virada de ciclo na leitura).
- Grants: só `service_role` desde `0183:722-726`; listada em
  `grupos/funcoesSeguras.ts:50-51`.
- Por corretor, não por grupo; `video_creditos` tem `grupo_id` derivado de
  `corretor_id` (0182:134). Cota padrão 5 ≠ tabela de planos (3/10/5).
- O vídeo só cobra a fila; `classificarFotos` e `entenderPedidoDeVideo`
  (custos de IA do vídeo) não são medidos.

### 4.3 Lista/anti-ban: `consumir_cota_campanha_espacada` + `whatsapp_envios_por_dia`
- Wrapper `reservarCotaCampanha` `whatsapp/repositorio.ts:1989` (bloco
  `:1900-2100`); limite do dia por USO (`calcularLimiteDoDia` `:1931`, lê
  `whatsapp_envios_por_dia` `:1939`); RPC `:2006`; devolução
  `devolverCotaCampanha` → `devolver_cota_campanha` `:2096`.
- SQL `0158_aquecimento_pelo_uso.sql:16` (tabela por `instancia_id`, `dia`
  de SP), função `:65-140` (incrementa `whatsapp_envios_por_dia` no mesmo
  update, `:108-110`), devolução `:153-170`.
- Chamadores: `campaignDispatcher.ts:719`, `cron/followups/route.ts:884`,
  `aberturaPelaIA.ts:129, 358`.
- É limite de SEGURANÇA do número por DIA, por instância; não é cota mensal
  do plano. Conta tudo que sai por iniciativa (lista, follow-up, lembrete,
  abertura), não só lista. O §10 quer os DOIS limites lado a lado: cota
  mensal do plano (não existe) + anti-ban (existe).

## 5. Storage por grupo

- Buckets: `empreendimentos` (público; `0043`, `0108` teto 50 MB),
  `documentos-clientes` (privado; `0118:100`), contabilidade (`0168:66`).
  Uploads Next: `api/imagens/gerar/route.ts:219`, `estudio/uploadReferencia.ts:47`,
  `imoveis/actions.ts:172, 554`, `importar/acoes.ts:355, 822`,
  `importar/OrigemPdf.tsx:94` (direto do navegador), `admin/precos/PrecosManager.tsx:108`
  (direto do navegador), `corretor/actions.ts:171`, `whatsapp/midiaRecebida.ts:55`,
  `financeiro/contador/acoes.ts:38`, worker de vídeo `scripts/video/worker.ts:112`.
- **Caminhos não carregam o grupo** (só o contador:
  `contador/acoes.ts:35` `${grupoId}/${mes}.xlsx`):
  - `empreendimentos/<empreendimento_id>/…` (mídias, book, `_importacao/` staging);
  - `empreendimentos/corretores/<corretor_id>/{criacoes,referencias,tabelas,videos}/…`;
  - `documentos-clientes/<lead_id>/whatsapp/…` e documentos do lead;
  - policies de `storage.objects` reescritas em `0184:298-346` pelo 1º/2º
    segmento.
- **Como somar bytes:** `storage.objects.metadata->>'size'` agrupado por
  `bucket_id` + 1º/2º segmento de `name`, juntando com
  `empreendimentos.grupo_id`, `corretores.grupo_id`, `leads.grupo_id`. Não
  existe coluna de tamanho em `midias`/`imagens_geradas`; nada no código
  soma bytes hoje.
- Órfãos conhecidos:
  - excluir lead (`leads/[id]/acoes.ts:296`, `leads/acoes.ts:94`) apaga
    linhas por CASCADE mas **não** remove arquivos de
    `documentos-clientes/<lead_id>/` → somar pelo `leads.grupo_id` perde o
    dono desses bytes (lead já não existe).
  - staging de PDF: removido só no caminho feliz (`importar/acoes.ts:342`).
  - artes expiradas: `imagens/limpeza.ts` remove Storage antes do banco.
  - arquivos de outras épocas sem linha (bucket `corretores` inerte, MEMORIA).
  - imóvel excluído remove mídias (`imoveis/actions.ts:834`).

## 6. Quando a OpenAI falha por crédito, hoje

- Atendimento: `http_429` → sem retentativa → fallback
  (`aiAgent.ts:685-711`, log `:747`): cliente recebe `textoDeContingencia`
  (`aiAgent.ts:663-672`, "Só um instante — deixa eu confirmar…") com
  `transferirHumano: true` e o corretor é alertado. **A cada mensagem nova
  repete** — nada lembra que já mandou contingência (item "sem mandar
  contingência repetida" do §18). Telemetria: `fallback=true`, `modelo='nenhum'`.
- Follow-up: pula (`cron/followups/route.ts:497`) ou descarta
  `ia_indisponivel` (`:1026`). Abertura pela IA: não envia (`aberturaPelaIA.ts:176, 314`).
- Dossiê/recusa/variação/estúdio/consultor: devolvem padrão ou erro local;
  variação de lista cai no texto sem variação.
- Áudio: OpenAI falha → Groq → Gemini (se as chaves existirem).
- Imagem: 402 + "Recarregue…" ao corretor.
- **Ninguém avisa a plataforma**: não há sinal "crédito acabando"; o
  diagnóstico é log de runtime (MEMORIA 02/09: o eval gravou 22 conversas
  mortas sem parar). Sem cascata de reserva desde 24/08 (motor único).

## 7. O que NÃO existe e a fase 2 precisa criar

1. Planos e cotas por grupo: `grupos` (`0181:55-60`) só tem `nome, slug,
   tipo`; sem `plano`, `situacao`, pacote extra, teto por corretor.
2. Medidor único: tabela de uso por grupo×ferramenta×mês (SP) + função
   `security definer` de reserva atômica (padrão de `reservar_credito_video`:
   `for update`, devolução só no mês corrente), com devolução em falha.
   Precisa entrar em `funcoesSeguras.ts` (`FUNCOES_SEM_GRUPO` ou citar o
   grupo), `tabelasSeguras.test.ts` (revoke anon/authenticated), não ser
   global em `tabelasDoGrupo.ts`, e ter `grupo_id` explícito no insert.
3. Ponto de cobrança nos ~20 caminhos sem rastro, incluindo os 5 `fetch`
   diretos; `chamarLlmJson` sem parâmetro de grupo/ferramenta.
4. Registro de tokens/custo que não expira e não é apagável pelo corretor
   (ia_interacoes não serve como está: grupo derivado, silêncios misturados,
   já apagada antes). Tabela de preço por modelo (não existe nenhuma; o
   "plano a preço de custo" precisa dela). Uso de imagem precisa ler o
   `usage` da resposta (hoje descartado).
5. Unidade de "resposta da IA" para cota: decidir se conta a resposta
   enviada (a 2ª chamada do eco, dossiê e recusa são custo sem resposta).
6. Distinguir crédito esgotado de rate-limit no `llm.ts` (hoje só
   `gerarImagem.ts:173` faz) e aviso à plataforma.
7. Memória de "contingência já enviada" por conversa (estado; hoje só texto
   condicional ao histórico).
8. Chave/conta separada para eval e scripts; fila/prioridade de vazão (TPM
   200k do `gpt-4.1-mini`, prompt ~10k tokens — MEMORIA 28/09).
9. Soma de bytes por grupo e política para órfãos (sobretudo
   `documentos-clientes` de lead excluído).
10. Tela "quanto já usei" (corretor e gestor) e uso por grupo no painel da
    plataforma; hoje só há `getSaldo` de vídeo e o teto do dia de imagem.

## 8. Armadilhas da MEMORIA relevantes

- Reserva antes do trabalho cria dívida: devolver em toda falha nossa
  (`devolver_cota_campanha`, `devolver_credito_video`).
- Mês/dia virando em UTC (5ª vez no projeto): `current_date` é UTC; usar
  `(now() at time zone 'America/Sao_Paulo')`. `getSaldo` repete a virada na
  leitura.
- "Construído e nunca ligado": medidor que existe sem chamador; contar
  `count(*)` depois de ligar.
- `apply_migration` do MCP cancela `delete`/`drop`; tabela nova no `public`
  nasce com ALL para `anon` E `authenticated` (0116) — grant por coluna sem
  `revoke all … from authenticated` é decorativo.
- Guarda de código-fonte que recorta por `lastIndexOf("function public.x")`
  acha o `grant execute` — ancorar em `create or replace`.
- Função de cota chamável pela chave pública (0135): revogar `execute` de
  `public/anon/authenticated`.
- Gestor/ADM não lê conversa alheia (0134): números de uso da equipe vêm por
  `clienteParaNumerosDaEquipe()` sem texto.
- Teto do relatório: consultar sem `count` paginado corta em 1000 linhas.
