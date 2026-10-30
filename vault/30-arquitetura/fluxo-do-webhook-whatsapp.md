---
title: Fluxo do webhook de WhatsApp — da mensagem à resposta da Sofia
aliases: [pipeline do atendimento]
tags: [whatsapp, ia, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/app/api/webhooks/whatsapp/route.ts, src/lib/whatsapp/quandoAIaResponde.ts, src/lib/whatsapp/turnoDeAtendimento.ts, src/lib/whatsapp/aiAgent.ts]
created: 2026-09-05
updated: 2026-10-30
fonte: leitura do código + docs/MEMORIA.md
summary: Autenticação → eventos técnicos → porteiro de lead cadastrado → transcrição/dedup/rajada → turnoDeAtendimento → envio → gravação → telemetria → dossiê → aviso.
---
# Fluxo do webhook de WhatsApp

`/api/webhooks/whatsapp` (`maxDuration = 60`):

0. **Número central** (0248, 30/10) — se a `instanceName` é a do central
   da plataforma, o evento inteiro vai para `tratarWebhookDoCentral`
   (`src/lib/central/webhook.ts`), com o mesmo segredo global, e nada abaixo
   roda. Numa instância de corretor, mensagem cujo remetente é o número
   central sai com `ignored: "central"` antes da IA (senão as duas IAs
   conversam em laço) ([[crm-pelo-whatsapp-numero-central-com-ia]]).
1. **Segredo** — falha fechada sem `CRON_SECRET`/segredo do webhook.
   **Antes disso, o descarte de grupo** (`@g.us`, transmissão, status) sai com
   200 "ignored". Única exceção (27/10): `messages.upsert` não `fromMe` num
   grupo `@g.us` passa pela MESMA autenticação (`resolverInstancia` +
   `requisicaoAutenticada` + `mensagemDoNumeroPodeSeguir`) e por
   `tratarMensagemDoGrupoDeLeads`, que só aceita o número central de um grupo
   com envio ligado e o grupo de WhatsApp de um corretor ativo; o
   processamento do retorno da ligação roda em `after()` e nada dali chega à
   IA ([[retorno-da-ligacao-pelo-grupo]]).
2. **Eventos técnicos** — conexão e ACK saem sem tentar criar conversa. Desde a 0174 o `connection.update` também apaga o marco da queda ao reconectar, carimba a queda uma vez e guarda o `statusReason`; qualquer outro evento tira a marca de sessão caída em segundo plano ([[queda-do-numero-pausa-a-lista-e-diz-o-motivo]]). Desde a 0198, o `connection.update` que abre um número já ligado a outro grupo derruba a sessão na Evolution e marca `numero_recusado_em` em vez de conectar ([[numero-em-um-grupo-e-aceite-dos-termos]]). Evento de mensagem por instância com recusa em aberto, ou ainda "conectando", só segue depois de a sincronização conferir o número (`mensagemDoNumeroPodeSeguir`); de outra conta, a mensagem é ignorada com 200 e o logout é tentado de novo.
3. **Porteiro de cadastro** — casa o telefone com um lead da carteira. Sem
   lead, devolve `numero_sem_lead_cadastrado`: não cria conversa nem lead e
   não manda áudio para transcrição ([[conversa-casa-com-lead-por-telefone]]).
   Leitura que FALHA não é "sem lead": o porteiro repete o passageiro e
   lança, e o webhook responde 503 para o provedor reentregar
   ([[erro-de-leitura-nao-e-numero-sem-lead]], 19/10).
   Exceção: convite de entrada, que inclui o anúncio da Meta reconhecido pela
   etiqueta (`externalAdReply`) ou pelo texto padrão; o lead nasce `meta/ctwa`
   e o anúncio vai para `impulsionamentos`
   ([[impulsionamento-do-corretor-pela-etiqueta-da-meta]]).
   O clique da mensagem pronta é gasto e ligado ao lead; se ele foi para o
   corretor do link pessoal (cookie, `cliques_whatsapp.do_link_pessoal`) e
   não veio de anúncio pago, a ficha recém-nascida vira
   `whatsapp/link_pessoal`, que a etiqueta de origem marca como trazida
   por ele ([[saida-do-corretor-e-etiqueta-de-origem]], 0200).
   Lead que NASCE assim: a IA fica calada e nada automático sai para o
   cliente, nem a boas-vindas fixa (tirada em 27/10)
   ([[lead-da-campanha-do-corretor-sem-ia]]) e, com a roleta do dono ligada, vai para o próximo da lista dele, depois da
   resposta ([[roleta-dos-anuncios]]).
   Antes dele, a mensagem do corretor com a palavra-chave cadastra o
   número na carteira dele; se o número já é lead de outro corretor, nada é
   criado e quem digitou recebe aviso no Início
   ([[palavra-chave-cadastra-o-lead]], 0146).
4. **Transcrição de áudio** — o arquivo DECIFRADO vem da Evolution
   (`getBase64FromMediaMessage`; a `url` do webhook é o `.enc` cifrado);
   OpenAI → Whisper (Groq) → Gemini, prompt neutro com `[inaudível]`, travas
   contra fala inventada; o turno recebe `instrucaoDoAudio`
   ([[audio-do-cliente-era-arquivo-cifrado]], [[whisper-nao-recusa-como-o-gemini]]).
5. **Gravação + dedup** — a conversa já nasce com `lead_id` obrigatório;
   `provider_message_id` único por grupo (0027, 0192) mata reentrega. Insert
   que falha por outro motivo NÃO vira "inédita": o webhook para com
   `mensagem_nao_gravada` e a IA não responde por cima de uma fala que o
   banco não tem (0192). Antes de desistir, erro passageiro (sem `code`,
   o Gateway Timeout) é repetido por `comRetentativa`. O `id` da linha
   nasce antes da primeira tentativa e é o mesmo em todas: a repetição bate
   na chave primária em vez de gravar a mesma fala de novo (mensagem sem
   `provider_message_id` não tinha índice que a protegesse), e o 23505 numa
   retentativa confere pelo próprio `id` — achou, é a nossa; não achou, é a
   reentrega concorrente do provedor.
   Gravada e inédita, se o lead é de outro corretor (roleta, repasse), o
   dono é avisado no grupo `NOME & ARETZ` dele em `after()`
   (`avisarMensagemDoClienteNoGrupo`, rajada de 8 s, 27/10).
6. **Porteiro da IA** — `decidirSeAIaResponde` ([[quando-a-ia-responde]]),
   a decisão inteira num lugar só: primeiro a conversa (lead de outro
   corretor, pediu para sair, IA desligada — a fala do corretor desliga, sem prazo), depois
   o número (IA desligada, expediente, co-piloto), e por fim a cota de
   respostas da IA do grupo no mês ([[cota-de-respostas-da-ia-por-grupo]], 0197:
   só cala quando ela responderia, motivo `cota_do_grupo`). Antes da cota vem
   a cobrança: grupo suspenso por atraso ou à mão cala com `grupo_suspenso`
   ([[cobranca-manual-e-suspensao]], 0207). Calada, grava o motivo em
   `ia_interacoes.acao` e o detalhe em `silencio` (0149), e ainda atualiza a
   ficha. O áudio não entendido também obedece a ela.
7. **Rajada** — espera 6s + trava `resposta:<conversaId>`; balões pendentes
   entram como linhas `Cliente:` separadas
   ([[rajada-agrupar-conteudo-nao-so-invocacoes]]).
8. **`executarTurnoDeAtendimento`** ([[turno-de-atendimento-e-o-caminho-unico]]):
   - catálogo ranqueado + encolhido por foco ([[foco-da-conversa]]);
   - few-shot ([[recuperar-por-relevancia]]) + estilo da casa + funil de
     qualificação + calendário;
   - resposta a um follow-up nosso (`instrucaoPelosFollowups`, vale o mais
     recente e só se ele foi a última palavra nossa) entra como
     `instrucaoExtra`: pós-visita (72h) → próximo passo; lembrete da
     véspera (30h) → "confirmo" grava `visita_confirmada_em` e avisa o
     corretor, "remarcar" oferece horários reais; pedido de indicação (96h)
     → agradece e avisa o corretor para registrar o indicado
     ([[aprimoramentos-das-oito-funcionalidades]], [[fechar-o-ciclo-e-ligar-a-plataforma]]);
   - trava da qualificação: enquanto falta pergunta do funil, bloco "AINDA
     EM QUALIFICAÇÃO" no prompt e, depois do LLM, corte de frase/anexo/link
     de imóvel que o cliente não trouxe ([[perguntas-antes-da-indicacao]]);
     confirmação de visita só passa se o planner viu o aceite
     ([[eval-de-28-09-e-a-v41]]);
   - com visita futura no CRM (`visitaMarcadaEm`), o planner reconhece
     remarcar e desmarcar; desmarcar é decidido pelo planner e gravado por
     `cancelarVisitaLead` ([[visita-remarcada-e-desmarcada-pela-conversa]]);
   - dúvida sobre o contato ("acho que você mandou errado", "quem é?") não
     vai à IA de recusa e vira a jogada `esclarecer_contato`, logo depois da
     recusa: quem escreve, por quê e, no começo, a oferta de parar; o "não" a
     essa oferta é parada ([[duvida-de-engano-nao-e-pedido-para-parar]]);
   - LLM ([[motor-unico-openai]], [[timeout-nao-e-retentado]]);
   - guardrails ([[midia-por-slug-nunca-por-url]]), `semValores`
     ([[a-ia-nao-fala-valores]]), prazo
     ([[detector-de-prazo-acusava-a-honestidade]]), `vozHumana`
     ([[voz-humana-e-funcao-nao-prompt]]), chunking
     ([[quebra-de-mensagens-chunking]]).
9. **Envio** — balões com pausa; mídia como anexo nativo; telefone normalizado
   no provedor ([[envio-mandava-telefone-sem-ddi]]).
10. **Gravação da resposta ANTES da telemetria**, vínculo depois
   ([[gravar-mensagem-antes-do-vinculo]]).
11. **Telemetria** (`ia_interacoes`) —
    [[ia-interacoes-filtrar-por-acao-respondida]].
12. **Dossiê** (extração p/ `leads` + `lead_observacoes_ia`) e **aviso ao
    corretor** ([[aviso-por-evolucao-nao-por-mensagem]]; também quando a IA
    promete que o corretor traz a resposta, `duvida_pendente`),
    **visita** ([[visita-e-gravada-com-validacao]]; remarcada ou desmarcada, alerta próprio — [[visita-remarcada-e-desmarcada-pela-conversa]]), **etapa do funil**
    ([[campanha-tambem-mexe-no-funil]]).

Orçamento de tempo: 6s rajada + 20s agente + ~5s envios + 12s dossiê ≈ 43s.

Custo: cada chamada paga do caminho (transcrição, recusa, resposta, a
retentativa contra repetição, dossiê) grava uma linha em `ia_consumo` com o
corretor do número (`quemPaga`), e é dela que sai o custo do grupo em
/plataforma ([[livro-do-consumo-da-ia]], 0233). A gravação é um insert por
chamada e fica FORA da latência medida.

Grupo (0191): a instância resolvida traz o `grupo_id` do número, e as taxas
do simulador que o turno usa são as desse grupo, não as do site. Toda linha
que o webhook grava herda o grupo da linha-mãe pelo gatilho
`<tabela>_00_grupo` ([[plataforma-multi-grupo]]). A palavra-chave procura o
lead "alheio" só no grupo da instância, e o catálogo que a IA recebe é o
do grupo da instância (`getEmpreendimentos(instancia.grupoId)`, Task 12).

Casa do grupo (0199, fase 4): junto com o catálogo, o webhook lê
`lerCasaDoGrupo(instancia.grupoId)` e passa como `identidade.casa`: nome da
imobiliária e região no prompt e no planner, nome e tom do grupo ganhando
dos da instância, e o nome E a região da casa fora do índice de foco
([[identidade-da-ia-de-cada-grupo]]). Leitura que falha cai no padrão do
grupo; a IA não cala por isso. O aviso ao corretor sem imóvel citado diz
"Imóveis em <região do grupo>" (era "Imóveis em Alphaville" fixo).

Fala do corretor (IA calada ou ao desligar): "combinado, sábado às 10" ou
a proposta dele aceita pelo cliente vira `visita_sugerida_para` e um
"Registrar?" no Início, nunca registro automático (0163).

## Relacionadas
- [[visao-geral-do-sistema]]
- [[fluxo-de-campanhas]]
- [[aprimoramentos-das-oito-funcionalidades]]
- [[fechar-o-ciclo-e-ligar-a-plataforma]]
