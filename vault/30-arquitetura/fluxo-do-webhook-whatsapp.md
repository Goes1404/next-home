---
title: Fluxo do webhook de WhatsApp — da mensagem à resposta da Sofia
aliases: [pipeline do atendimento]
tags: [whatsapp, ia, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/app/api/webhooks/whatsapp/route.ts, src/lib/whatsapp/quandoAIaResponde.ts, src/lib/whatsapp/turnoDeAtendimento.ts, src/lib/whatsapp/aiAgent.ts]
created: 2026-09-05
updated: 2026-10-04
fonte: leitura do código + docs/MEMORIA.md
summary: Autenticação → eventos técnicos → porteiro de lead cadastrado → transcrição/dedup/rajada → turnoDeAtendimento → envio → gravação → telemetria → dossiê → aviso.
---
# Fluxo do webhook de WhatsApp

`/api/webhooks/whatsapp` (`maxDuration = 60`):

1. **Segredo** — falha fechada sem `CRON_SECRET`/segredo do webhook.
2. **Eventos técnicos** — conexão e ACK saem sem tentar criar conversa.
3. **Porteiro de cadastro** — casa o telefone com um lead da carteira. Sem
   lead, devolve `numero_sem_lead_cadastrado`: não cria conversa nem lead e
   não manda áudio para transcrição ([[conversa-casa-com-lead-por-telefone]]).
   Exceção: convite de entrada, que inclui o anúncio da Meta reconhecido pela
   etiqueta (`externalAdReply`) ou pelo texto padrão; o lead nasce `meta/ctwa`
   e o anúncio vai para `impulsionamentos`
   ([[impulsionamento-do-corretor-pela-etiqueta-da-meta]]).
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
   `provider_message_id` único (0027) mata reentrega.
6. **Porteiro da IA** — `decidirSeAIaResponde` ([[quando-a-ia-responde]]),
   a decisão inteira num lugar só: primeiro a conversa (lead de outro
   corretor, pediu para sair, IA desligada — a fala do corretor desliga, sem prazo), depois
   o número (IA desligada, expediente, co-piloto). Calada, grava o motivo em
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
    **visita** ([[visita-e-gravada-com-validacao]]), **etapa do funil**
    ([[campanha-tambem-mexe-no-funil]]).

Orçamento de tempo: 6s rajada + 20s agente + ~5s envios + 12s dossiê ≈ 43s.

## Relacionadas
- [[visao-geral-do-sistema]]
- [[fluxo-de-campanhas]]
- [[aprimoramentos-das-oito-funcionalidades]]
- [[fechar-o-ciclo-e-ligar-a-plataforma]]
