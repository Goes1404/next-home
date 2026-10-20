# Mapa — cobrança e suspensão (fase 2 multi-grupo)

> **Numeração (20/10/2026):** este documento foi escrito com a numeração antiga. A fase 1 (0181–0185) virou **0190–0194** (0181→0190, 0182→0191, 0183→0192, 0184→0193, 0185→0194) e a fase 2 (0186, 0187) virou **0195** e **0196**. Os números abaixo, inclusive as referências `arquivo:linha`, são os antigos.

Branch `fase-1-multi-grupo`, leitura de 19/10/2026. Só fatos com arquivo:linha.
Desenho: `docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md`
§10 (planos/medidor), §11 (painel da plataforma, `situacao`), §18 "Fase 2",
§19 respostas 2, 4, 6. Lacunas: `docs/superpowers/specs/2026-10-19-lacunas-multi-grupo.md`
L31-L42 (fase 2), L36 (pode operar), L40 (cobrança), L80 (encerramento).

---

## 1. O que o desenho pede (resumo das regras que tocam esta frente)

- §3 linha 42: cobrança automática é NÃO-objetivo; "o Matheus cobra por fora e
  marca como pago".
- §11 linhas 245-256: painel da plataforma "marca pagamento e suspende/reativa
  grupo"; grupo tem `situacao` (ativo, suspenso, encerrado); "o cliente final do
  grupo nunca recebe mensagem de erro da plataforma"; o que para no suspenso é
  decisão do construtor (§17 linha 376).
- §18 Fase 2 linhas 470-482: "Ponto único 'pode operar' no webhook, nos crons e
  no disparador (corretor ativo, grupo ativo, cota), sem mandar contingência
  repetida ao cliente (`repositorio.ts` `resolverInstancia`, `aiAgent.ts`
  `textoDeContingencia`)"; "Cobrança manual completa: ciclo, pro rata, carência,
  troca de plano, faturas; registro diário de assento (número conectado ou lead
  na carteira)"; saúde por grupo inclui inadimplência (linha 486).
- §19 resposta 6 (linha 611): suspensão AUTOMÁTICA no 5º dia de atraso, aviso no
  painel desde o vencimento.
- §19 resposta 2: login com e-mail real (exige e-mail transacional, hoje sem
  chave) — é o canal por onde avisos de cobrança/suspensão chegariam (L32).
- §10: medidor único, reserva antes de gastar, mês no fuso de São Paulo, aviso
  aos 80%, "ao acabar a IA para e avisa o corretor"; plano a preço de custo (o da
  Next Home).

## 2. O que EXISTE hoje de plano/assinatura/fatura/suspensão

**Nada.** Busca por `plano|assinatura|fatura|suspens|situacao|inadimpl|mensalidade|
billing|subscription|invoice` em `src/` e `supabase/migrations/` não acha nenhum
modelo de cobrança da plataforma (só `Suspense` do React, `situacao` de
documentos do lead, "plano Hobby" em comentários).

### `grupos` (fase 1)
- `supabase/migrations/0181_grupos.sql:55-61`: colunas `id, nome, slug, tipo
  ('imobiliaria'|'independente'), criado_em`. **Sem `situacao`, sem plano, sem
  vencimento, sem contato de cobrança.**
- `0181:70-72`: grupo 1 Next Home com id fixo `00000000-…-0001`
  (`src/lib/grupos/grupo.ts:7`).
- `0181:213-224`: RLS — logado lê só a própria linha (`id = grupo_atual()`);
  escrita só pela chave de serviço.
- `0181:239-264`: `administradores_da_plataforma` + `eh_admin_da_plataforma()`.
  **Nenhum código em `src/` chama `eh_admin_da_plataforma`** (só a lista de
  funções seguras `src/lib/grupos/funcoesSeguras.ts:27` e os tipos
  `src/lib/supabase/types.ts:3777`). Não existe rota de painel da plataforma.
- `src/lib/grupos/tabelasDoGrupo.ts:15-26`: `TABELAS_GLOBAIS` (grupos,
  administradores_da_plataforma, whatsapp_disparo_lock, whatsapp_diagnosticos).
  Tabela nova sem `grupo_id` precisa entrar aqui E no SQL da 0182
  (`isolamento.db.test.ts` confere nas duas direções).
- `src/lib/grupos/tabelasDoGrupo.ts:39-59`: `CHAVES_UNICAS_GLOBAIS`. Uma trava
  "número único entre todos os grupos" (§19 resposta 4) seria chave única global
  nova → precisa ser declarada aqui e no cabeçalho da 0183.

### Medidores que existem (os que o §10 manda unificar)
| Medidor | Onde | Escopo | Observação |
|---|---|---|---|
| Créditos de vídeo | `0092_video_jobs.sql:73-84` (`video_creditos`), `reservar_credito_video` `0092:97-141`, `devolver_credito_video` `0092:152-174` | por **corretor**, cota_mensal padrão 5, `creditos_avulsos` | ciclo por mês em SP (`0092:113`); `FOR UPDATE`; devolve se o job falha (`src/lib/video/fila.ts:133-167`). Revogado do `authenticated` na `0183:722-725`. `creditos_avulsos` **não tem caminho de escrita no app** (só leitura em `src/lib/video/fila.ts:81-94`). |
| Teto de imagens | `src/lib/imagens/imagensTipos.ts:20` (`TETO_DIARIO = 20`), `src/lib/imagens/galeria.ts:149-160`, conferido em `src/app/api/imagens/gerar/route.ts:90-97` | por **corretor**, por **dia** | conta linhas de `imagens_geradas`, que expiram em 48-72h (0109) — não serve para mês (L37). |
| Cota da lista (anti-ban) | `reservarCotaCampanha` `src/lib/whatsapp/repositorio.ts:1989-2010` → RPC `consumir_cota_campanha_espacada` (última def. `0158:65`); limite por uso `calcularLimiteDoDia` `repositorio.ts:1931`; histórico `whatsapp_envios_por_dia` `0158:16` | por **instância** (número), por dia | é segurança do número, não cota do plano (§10 diz que a tela mostra os dois). Chamada em `campaignDispatcher.ts:719`, `aberturaPelaIA.ts:129,358`, `cron/followups/route.ts:884`. |
| Tokens por resposta | `ia_interacoes.tokens_entrada/saida` gravados em `src/lib/whatsapp/telemetria.ts:87-140` | por conversa/corretor | só o agente e algumas origens gravam; o resto das chamadas pagas não grava (L37). |

`whatsapp_envios_por_dia` (0158:16) é o único registro DIÁRIO por instância que
existe — precedente de forma para o "registro diário de assento" (L40), que não
existe.

## 3. Financeiro existente é da IMOBILIÁRIA, não da plataforma

Nenhuma destas tabelas trata da mensalidade do grupo; todas são do negócio do
cliente (comissão, caixa, nota fiscal). Nomes a evitar colidir/confundir:
- `0114_vendas.sql:29` `vendas`, `:58` `venda_participantes`
- `0115_financeiro_ranking_metas_e_roleta.sql:120` `metas_corretor`
- `0166_caixa_da_imobiliaria.sql:26` `caixa_lancamentos`, `:49` `caixa_saldos`
- `0167_fiscal_da_imobiliaria.sql:20` `fiscal_config`, `:37` `venda_fiscal`,
  `:48` `corretor_fiscal`
- `0168_contador.sql:19` `meses_fechados`, `:30` `acessos_contador`
- `0169_ia_do_financeiro.sql:11` (origem nova em `ia_interacoes`)
- Coluna `video_jobs.cobranca` ('cota'|'credito') — palavra "cobrança" já usada
  com outro sentido (`src/lib/video/fila.ts:133-158`).
- Menu "Financeiro" do painel já é do cliente (MEMORIA: 0114-0116, 0166-0169).

## 4. Crons existentes (todos os lugares que rodam sem sessão)

### Vercel (`vercel.json:3-20`) — 4 jobs, diários (Hobby)
| Rota | Agenda (UTC) | Lê grupo? |
|---|---|---|
| `/api/cron/campanhas` | `0 13 * * *` | não; chama `processarFilaCampanhas({dono})` (`src/app/api/cron/campanhas/route.ts:114`), se reencadeia por `after()`+`fetch` (`:83-85`) |
| `/api/cron/meta-ads` | `30 9 * * *` | integração só do grupo 1 (`src/lib/grupos/integracoes.ts:22-26`) |
| `/api/cron/event-outbox` | `15 10 * * *` | sem referência a grupo |
| `/api/cron/limpar-artes-ia` | `0 3 * * *` | sem referência a grupo |

### pg_cron (funções `configurar_*` + `cron.schedule` em migration)
| Job | Onde | Frequência | Estado (MEMORIA) |
|---|---|---|---|
| `disparo-campanhas` → `/api/cron/campanhas` | `0025_cron_disparo_campanhas.sql:43,80` | 1/min | ativo |
| `followups-whatsapp` → `/api/cron/followups` | `0028_whatsapp_followups.sql:40,74` | */5 min | ativo |
| `relatorio-semanal` | `0076_relatorio_semanal_no_pg_cron.sql:30,69` | seg 11h UTC | **desagendado** (03/09) |
| `aviso-de-espera` → `/api/cron/quem-esta-esperando` | `0089_aviso_de_quem_espera.sql:32,68` | 12h e 18h UTC | **desagendado** (03/09) |
| `arquivar-leads-sem-resposta` (SQL puro, sem HTTP) | `0164_arquivar_lead_sem_resposta.sql:98-101` | 9h10 UTC | agendado na própria migration |

Crons que JÁ laçam por grupo (pontos naturais para pular grupo suspenso):
`src/app/api/cron/quem-esta-esperando/route.ts:95-103` e
`src/app/api/cron/relatorio-semanal/route.ts:97-103` — ambos `from("grupos").select("id")`
sem filtro de situação.

### GitHub Actions com `schedule`
`render-video.yml:42-45` (`0 * * * *`, rede de segurança do worker de vídeo),
`e2e.yml:59-62`, `conferir-lista.yml:15-16`, `variantes-de-imagem.yml:23`.

## 5. "Pode operar" hoje — onde a decisão está (e o que ela NÃO olha)

### 5.1 `resolverInstancia` — `src/lib/whatsapp/repositorio.ts:87-138`
- Lê a instância por `instance_name` (`:91-98`) incluindo `grupo_id`, depois
  `corretores(nome, creci, whatsapp, slug)` (`:102-106`) e `so_whatsapp`
  (`:109`, `contaSoWhatsapp.ts:13-24`).
- **Não lê `corretores.ativo`** nem nada do grupo além do id. Corretor desativado
  com número conectado continua sendo atendido pela IA (L36).
- Devolve `InstanciaResolvida` (`:49-80`) com `grupoId` (`:53`); conta só
  WhatsApp força `modoBot: "desativado"` (`:124`).
- Chamadores: webhook `src/app/api/webhooks/whatsapp/route.ts:312`; "Responder
  com IA" do painel `src/app/corretor/(painel)/conversas/acoes.ts:649`.
- No webhook, depois dela vêm: autenticação (`route.ts:314`), 404 se nula
  (`:318-322`), eventos de conexão/ack/contatos (`:349-405`), palavra-chave do
  corretor (`cadastrarPelaPalavraChave` `:469`), porteiro/conversa
  (`obterOuCriarConversa` `:509`), gravação da mensagem (`gravarMensagem`
  `:650`, `:758`), decisão (`:899`), envio (`:1228`).

### 5.2 `decidirSeAIaResponde` — `src/lib/whatsapp/quandoAIaResponde.ts:121-163`
- Módulo puro. Duas camadas: conversa (`silencioDaConversa` `:112-119`: lead de
  outro corretor, pediu para sair, IA desligada) e número (`decidirPorModo`:
  desativado, expediente, co-piloto).
- `MotivoDoSilencio` (`:79-85`) **não tem motivo de grupo, plano ou cota**.
  `fraseDaDecisao` (`:192-216`) faz `switch` exaustivo sobre ele → motivo novo
  obriga a frase e o tipo de `ia_interacoes.silencio` (`registroDoSilencio`
  `:219-233`, coluna da 0149).
- `podeEnviarPorIniciativa` (`:176-186`) — lembrete de visita.
- Chamadores: webhook `route.ts:899`; varredura de atrasadas
  `cron/followups/route.ts:438`; lembrete `cron/followups/route.ts:881`; selo do
  painel `conversas/chatModelo.ts:280` (a tela tira a frase da mesma decisão —
  regra da MEMORIA 04/10).

### 5.3 `textoDeContingencia` — `src/lib/whatsapp/aiAgent.ts:663-672`
- Com histórico: "Só um instante — deixa eu confirmar isso certinho para você.
  Já te respondo."; sem: "Oi! … Me dá um minutinho que já te respondo
  direitinho."
- Usada em `gerarRespostaIA` no `fallback` (`aiAgent.ts:685-711`), disparado
  quando `chamarLlmJson` falha (`:740-751`). `transferirHumano: true`.
- O webhook **envia o texto de contingência ao cliente a cada mensagem** que cai
  no fallback: não há checagem de `meta.fallback` antes do envio (`route.ts`
  só usa `fallback` na telemetria, `:1528`; envio em `:1228`, `:1262`). Não há
  dedup de "já mandei contingência nesta conversa" (L36).
- `aberturaPelaIA.ts:176` e `:314` JÁ tratam `meta.fallback` (não enviam).
- Se a cota/suspensão for implementada fazendo o LLM "falhar", o cliente
  receberia esta frase repetidamente — o §11 proíbe.

### 5.4 Disparador de campanhas — `src/lib/whatsapp/campaignDispatcher.ts`
- `processarFilaCampanhas` `:181-322`. Ordem: `varrerQuedasDeNumero` `:228`,
  `protegerNumerosQueCairam` `:232`, listas vivas `:236-238`, janela `:240-261`,
  consulta de instâncias `:263-272` (**sem filtro de corretor ativo nem de
  grupo**), laço por instância `:279-319`.
- `processarInstancia` `:347+`: bloqueio do disjuntor `:366-371`, conexão
  `:379-398`, campanhas ativas do corretor `:400-411`, trava `instancia:<id>`
  `:414`, reserva de cota anti-ban `:719`.
- MEMORIA: o aviso de queda foi posto ANTES das saídas antecipadas porque um
  aviso pendurado depois herda todas elas (seção "Auditar o roadmap com
  agentes"). O mesmo vale para qualquer gate de grupo novo.

### 5.5 Follow-ups e varreduras — `src/app/api/cron/followups/route.ts`
`GET` `:565-695`, na ordem, SEM nenhum filtro de grupo/situação:
1. `varrerRespostasAtrasadas` `:580` (`:354-411`, view `whatsapp_esperando_resposta`
   `:369-373`; `responderAtrasada` `:416+` lê instância `:422-428`, checa
   `conectado_em`/`bloqueado_ate`, aplica `decidirSeAIaResponde` `:438`; **chama a
   IA**).
2. `lerCaixasDoGmail` `:585` (só grupo 1 por integração).
3. `enviarResumosDoDia` `:595`, `enviarRelatoriosDasAvaliacoes` `:605`,
   `alertarLeadsSemContato` `:616`, `alertarClientesSemResposta` `:625`,
   `liberarReservasVencidas` `:629`, `processarLembretesDeAnotacao` `:637`,
   `processarLembretesDeTarefa` `:640` — todos vão ao corretor via
   `avisarCorretor` (`src/lib/crm/avisoAoCorretor.ts:14-34`, que checa
   `corretores.ativo` `:24,26` e número conectado `:21`).
4. Janela `:648`; trava global `followups` `:653`.
5. `agendarLembretesDeVisita/PosVisita/PedidoDeIndicacao` `:658-660`,
   `avisarQuemPediuAlerta` `:671` (IA), fila `whatsapp_followups` `:676-689` →
   `processarFollowup` `:790+` (reserva cota `:884`).

### 5.6 Outros caminhos que gastam IA ou falam pelo grupo sem passar pelo webhook
- Palavra-chave / "IA assume agora" / "Responder com IA": `gerarEEnviarPelaIA`
  `src/lib/whatsapp/aberturaPelaIA.ts:61` (chamada em `webhooks/whatsapp/route.ts:707`,
  `conversas/acoes.ts:393`), `responderComIA` `conversas/acoes.ts:637`.
- Rascunho/sugestão: `rascunharPelaIA` `aberturaPelaIA.ts:274`,
  `enviarRascunhoDaIA` `:337`.
- Variação de lista: `campaignQueue.ts:167`.
- 17 chamadas a `chamarLlmJson` (`src/lib/whatsapp/llm.ts:209`, **sem parâmetro
  de grupo/corretor**): `campanhas/acoes.ts:357`, `financeiro/assistente/acoes.ts:46`,
  `imoveis/actions.ts:747`, `consultor/turno.ts:119`, `estudio/turno.ts:384`,
  `imagens/engenheiroDePrompt.ts:152`, `imagens/tradutor.ts:254`,
  `imoveis/rascunhoDePdf.ts:185`, `inbound/aiParser.ts:40`,
  `leads/importacao.ts:1101`, `leads/leituraPorIa.ts:182`,
  `precos/leituraPorIa.ts:190,298`, `whatsapp/aiAgent.ts:740`,
  `whatsapp/campaignQueue.ts:167`, `whatsapp/classificarRecusa.ts:42`,
  `whatsapp/dossierExtractor.ts:161`.
- `fetch` direto à OpenAI fora de `llm.ts`: `imagens/gerarImagem.ts:37-38`,
  `imoveis/lerPlanta.ts:23`, `video/classificarFotos.ts:31`,
  `whatsapp/audioTranscriber.ts:201`.
- Vídeo: `enfileirarVideo` `src/lib/video/fila.ts:125`; worker no GitHub Actions
  (`render-video.yml`).
- Imagens: `src/app/api/imagens/gerar/route.ts` (teto `:90-97`; frase "Recarregue"
  `:293-294` — L38 diz que a conta é da plataforma).

### 5.7 Sessão / login / painel
- Login: `entrar` `src/app/corretor/actions.ts:35-77` — só confere senha e
  `deve_trocar_senha`; nada de grupo.
- Proxy: `src/proxy.ts:55-73` — só existe sessão (`getClaims`), sem banco.
- Sessão: `getCorretorLogado` `src/lib/corretorSessao.ts:59-87` — devolve `null`
  para inativo (`:84`) e carrega `grupoId` (`:86`). **Não lê o grupo**. É
  chamada ~68 vezes (comentário `:51`), com `cache()` por requisição.
- Layout: `src/app/corretor/(painel)/layout.tsx:51` chama `getCorretorLogado`;
  já desenha uma faixa global por tela (`FaixaConexao`, `:113`) — precedente para
  o "aviso no painel desde o vencimento" (§19 resposta 6).
- Guardas: `src/lib/guardas.ts:33-50` (`exigirGestorNaPagina/Acao`), só papel.
- Banco: `grupo_atual()`, `corretor_atual()`, `eh_gestor()` (`0181:114-142`)
  filtram `ativo` do corretor, não situação do grupo. Toda policy passa por elas
  (MEMORIA: RLS permissiva por OR; layouts não re-executam entre rotas irmãs).

### 5.8 Portas públicas do site (grupo vem de `grupoDoSite()`, fixo no grupo 1)
- `grupoDoSite` `src/lib/grupos/grupo.ts:17-19` devolve sempre a Next Home;
  resolução por `Host` é fase 3.
- `/wa` `src/app/wa/route.ts:28,44` (`sortear_corretor_whatsapp(p_grupo)`),
  `/wa/[campanha]` `src/app/wa/[campanha]/route.ts:40-41`.
- Formulário `src/app/api/leads/route.ts:143,190-191`;
  `src/app/api/clique-whatsapp/route.ts`.
- Webhooks fixos no grupo 1: `api/webhooks/meta/route.ts` e
  `api/webhooks/email-lead/route.ts` (importam `GRUPO_NEXT_HOME_ID`).
- Links por token (sem sessão): `api/agenda/[token]`, `contador/[token]/baixar`,
  `selecao/[token]/ir/[slug]`, páginas `portal/`, `proposta/`, `documentos/`.
- §18 Fase 3 linha 523: destino de links de grupo suspenso/encerrado é fase 3
  (L59).

## 6. Canais de aviso (para "aviso desde o vencimento" e "IA para e avisa")
- `enviarEmail` `src/lib/email.ts:54-93`: falha fechada sem `RESEND_API_KEY`
  (`:55,80`), recusa `nexthome.com` (`:63-75`), remetente `EMAIL_REMETENTE` ou
  padrão (`:93`). Hoje sem chave em produção (MEMORIA 03/09).
- `avisarCorretor` `src/lib/crm/avisoAoCorretor.ts:14-34`: WhatsApp do próprio
  número do corretor — não chega a quem está com o número caído nem ao gestor
  que não tem número.
- `grupos` não tem contato de cobrança (L32).
- `admin_eventos.acao` CHECK (`0134_adm_nao_le_conversa_alheia.sql:124-135`):
  `conta_criada, senha_redefinida, papel_alterado, corretor_desativado,
  corretor_reativado, leads_redistribuidos, numero_desconectado`. Sem ações de
  plataforma (suspender, pagar); `ator_id` referencia `corretores`
  (`0030:28-29`), não `auth.users` (L41).

## 7. Onde a fase 2 encaixa (pontos factuais de inserção)

1. `grupos`: colunas novas (situação, plano, vencimento/ciclo, contato de
   cobrança) em `0181:55-61` → migration nova; escrita só por chave de serviço
   ou função de admin da plataforma (RLS de `0181:213-224` já fecha escrita).
2. Função "pode operar" única, consultada:
   - webhook logo após `resolverInstancia` (`route.ts:312-322`) — ou dentro de
     `resolverInstancia` (`repositorio.ts:87`), que também serve ao painel
     (`conversas/acoes.ts:649`);
   - `decidirSeAIaResponde` ganharia motivos (`quandoAIaResponde.ts:79-85`) com
     frase em `fraseDaDecisao` e registro em `registroDoSilencio`;
   - disparador: consulta de instâncias `campaignDispatcher.ts:263-272` (antes
     do laço) e/ou `processarInstancia` antes da trava `:414`;
   - followups: cada sub-rotina de `cron/followups/route.ts:580-689`;
   - `aberturaPelaIA.ts:61/274/337`, `responderComIA` `conversas/acoes.ts:637`;
   - crons com laço por grupo (`quem-esta-esperando:95`, `relatorio-semanal:97`).
3. Medidor único substituindo `reservar_credito_video` (0092), `TETO_DIARIO`
   (`imagensTipos.ts:20`) e cobrindo `chamarLlmJson` (`llm.ts:209`) + os 4
   `fetch` diretos; reserva atômica no padrão de `consumir_cota_campanha_espacada`
   (0158:65) e `reservar_credito_video` (0092:97).
4. Saída "cota acabou" sem passar por `textoDeContingencia` (`aiAgent.ts:663`):
   decidir antes de chamar o LLM, como silêncio registrado (padrão do
   `!decisaoIA.responde` em `route.ts:930-947`).
5. Painel/login: checagem de situação do grupo em `getCorretorLogado`
   (`corretorSessao.ts:59`) e/ou nas funções de sessão do banco (`0181:114-142`);
   faixa de aviso no layout ao lado de `FaixaConexao` (`layout.tsx:113`).
6. Suspensão automática no 5º dia (§19-6): precisa de executor diário — pg_cron
   SQL puro (padrão `0164:98-101`) ou rota HTTP no tique existente.
7. Registro diário de assento: tabela nova no padrão de
   `whatsapp_envios_por_dia` (`0158:16`).

## 8. O que NÃO existe e precisa ser criado
- `grupos.situacao` (ativo/suspenso/encerrado) e qualquer leitura dela.
- Tabelas de plano, assinatura do grupo, fatura/pagamento, ciclo, vencimento,
  carência, pro rata, troca de plano, pacote extra.
- Registro diário de assento (número conectado ou lead na carteira).
- Medidor único por grupo/mês/ferramenta, com reserva e devolução; tela "quanto
  já usei"; aviso aos 80%.
- Gravação de tokens/custo por grupo para TODA chamada paga (hoje só parte via
  `ia_interacoes`).
- Painel da plataforma (rotas, guarda por `eh_admin_da_plataforma()`), "marcar
  pago", suspender/reativar, saúde por grupo.
- Ações de plataforma em `admin_eventos` (CHECK e ator).
- Contato de cobrança do grupo e remetente de e-mail com chave.
- Ponto único "pode operar" (hoje inexistente: cada caminho tem suas checagens
  próprias e nenhum olha grupo, e o webhook/disparador nem olham `corretores.ativo`).
- Executor da suspensão automática no 5º dia.
- Trava de número único entre grupos (§19-4).

## 9. Armadilhas (fonte: código + `docs/MEMORIA.md`)
- **Teto de crons do Hobby**: `vercel.json` já tem 4 jobs; 4 foi aceito (MEMORIA
  "O Hobby ACEITA 4 cron jobs", 11/09), o teto real não é documentado e excesso
  RECUSA o deployment inteiro com `cron_jobs_limits_reached`, sem log (MEMORIA
  seção Vercel). O relatório semanal foi para o pg_cron por isso (0076).
- **pg_cron: aplicar migration não liga nada** — `configurar_*` precisa ser
  chamada (MEMORIA "Construído e nunca ligado"); e rota chamada por `net.http_post`
  precisa exportar `POST` (MEMORIA "Cron que agendou com sucesso e responde 405";
  guarda `src/app/api/cron/cronAceitaPost.test.ts`).
- **Gate pendurado depois de saída antecipada herda todas elas** (aviso de queda,
  MEMORIA 31/08): o disparador tem 3 saídas antes do laço
  (`campaignDispatcher.ts:240-277`) e followups tem `return` de janela em `:648`.
- **Contingência repetida** ao cliente (5.3) — e o §11 proíbe erro da plataforma
  ao cliente final.
- **Fuso de São Paulo** para virar mês/dia (MEMORIA: armadilha registrada 5+
  vezes; `0092:113`, `galeria.ts:142-148`).
- **Trava de segurança erra para "recusar"**: erro do banco ao ler cota =
  recusa (MEMORIA 28/08, `0092:90-91`). Para suspensão, o desenho exige o
  contrário no caminho do cliente final (não pode mandar erro) — decidir qual
  lado em cada ponto.
- **Contador que a aplicação lê-soma-grava perde corrida**; reserva no banco,
  num UPDATE atômico (MEMORIA 28/08 e 0092 `FOR UPDATE`).
- **Contar a partir de linha que expira** (`imagens_geradas` 48-72h, 0109) faz o
  medidor mensal perder contagem (L37).
- **`ia_interacoes` sem conversa** (playground/eval/consultor) cai na regra de
  carimbo "nenhuma mãe → grupo do logado, senão único, senão falha" (0182:145-147,
  `:153-154`): com dois grupos e chave de serviço, telemetria sem conversa falha.
- **Grant por coluna / ALL do Supabase**: tabela nova no `public` nasce com ALL
  para `anon` e `authenticated` (0181:208-217, MEMORIA 0082/0116); guarda
  `tabelasSeguras.test.ts`. Plano/fatura não podem ser escritos pelo gestor.
- **Policy sozinha não basta / grant sozinho não basta** (MEMORIA 0055, 0097).
- **Layout não re-executa entre rotas irmãs**: guarda de suspensão só no layout
  não protege navegação seguinte; precisa ser por página/ação (`guardas.ts:26-31`).
- **`chamarLlmJson` não sabe de quem é a chamada** (`llm.ts:209-231`): medir por
  grupo exige passar o grupo/corretor por 17 chamadores + 4 `fetch` diretos.
- **Mensagem "Recarregue"** em `api/imagens/gerar/route.ts:294` manda o corretor
  recarregar uma conta que é da plataforma (L38).
- **Migration aplicada ≠ produção protegida**: endurecer também a função antiga
  que o código no ar ainda chama (MEMORIA 0063).
- **Colisão de número de migration** com branch paralela (MEMORIA 10/09, 28/09):
  a última aqui é `0185_pos_deploy_multi_grupo.sql`.
- **Ruído de nomenclatura**: "cobrança" já é coluna de `video_jobs`; "Financeiro"
  é menu do cliente; `situacao` já é coluna de `lead_documentos` (0179:20).
- **Contador de aba / aviso que vive aceso vira paisagem** (MEMORIA régua do
  `evolucaoConversa`) — vale para a faixa de vencimento.
