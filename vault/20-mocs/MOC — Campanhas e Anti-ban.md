---
title: MOC — Campanhas e Anti-ban
tags: [moc, campanhas, anti-ban]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-10-27
summary: Disparo em massa, fila, cota, espaçamento, follow-ups.
---
# Campanhas e Anti-ban — Map of Content

## Arquitetura
- [[agendamento-comeca-na-propria-fila]]
- [[a-conversa-fantasma-do-disparo-sem-ddi]] ⚠️ o disparo abria conversa paralela sem DDI (11/09)
- [[fluxo-de-campanhas]] ⚠️ o mapa do caminho inteiro
- [[pg-cron-e-o-relogio-de-verdade]]
- [[travar-disparo-e-por-instancia]]
- [[followups-consomem-cota]]

## Proteções anti-ban
- [[campanha-protege-quem-ja-foi-contatado]]
- [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]
- [[espacamento-anti-ban-so-existia-no-papel]]
- [[o-lado-certo-de-errar-numa-trava]]
- [[trocar-numero-zera-reputacao]]
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]] ⚠️ o WhatsApp restringiu um número por lista fria; a lista agora tira número sem WhatsApp e para sozinha (0171-0172, 07/10)
- [[primeiro-contato-tem-teto-proprio]] ⚠️ o WhatsApp do Ramos caiu após 48 primeiros contatos com a mesma foto; primeiro contato tem teto de 10/dia e 30/semana, nada nos 7 dias depois de conectar ou cair, e vai sem foto (0217, 26/10); desde 0222 um contador só por corretor em lista, ✨, aviso de imóvel novo e roleta; 0223 tira do corretor a gravação de mensagens (27/10)
- [[o-que-vai-ao-cliente-pelo-numero-central]] — o central não abre primeiro contato: o que vai ao cliente exige fala dele na conversa com aquele número, e iniciativa nossa gasta a cota do número (onda 3, 30/10)
- [[aquecimento-do-numero-pelo-uso]] ⚠️ o limite diário segue o uso da última semana, não a idade (0158, 03/10); desde 09/10 os limites só podem ser apertados, nunca afrouxados
- [[saude-do-numero-pelo-central]] — o central diz a cota da lista e as vagas de primeiro contato com as MESMAS funções do disparador (contagem que falha vale zero), e quanto da lista fica para amanhã pela conta da tela (onda 3, frente O, 30/10)
- [[texto-da-lista-conferido-antes-de-sair]] ⚠️ cada mensagem só sai abaixo de 0,70 de semelhança com as do número; o A/B também é reescrito (0173, 08/10)
- [[sessao-caida-com-o-numero-conectado]] ⚠️ "Connection Closed" com o número "conectado": o painel pede para reconectar, e reconectar levanta a pausa de 12h (09/10)
- [[queda-do-numero-pausa-a-lista-e-diz-o-motivo]] ⚠️ número fora do ar por 30 min pausa as listas; o limite só volta a 15 com 3 dias seguidos sem conectar (0176); a queda guarda o motivo do WhatsApp; sessão caída sai do rodízio (0174, 10/10)
- [[estado-do-numero-so-o-servidor-escreve]] ⚠️ os limites do número não dependem mais de o corretor não abrir o console: só o servidor grava contador, aquecimento, disjuntor e conexão (0175, 10/10)

## Diagnóstico
- [[fila-parada-tres-causas]] ⚠️ runbook principal
- [[numero-sem-whatsapp-nao-e-falha-nossa]]
- [[envio-mandava-telefone-sem-ddi]]
- [[primeira-semana-em-producao]] — em 10/10, 4 dos 6 números desconectados e ninguém avisado fora do painel

## Painel
- [[selecao-manual-da-transmissao-e-a-ultima-revisao]]
- [[botoes-perigosos-atras-de-avancado]]
- [[campanha-tambem-mexe-no-funil]]

## Relacionados
- [[MOC — IA e Atendimento]] · [[Home]]
- [[oito-funcionalidades-de-26-09]] — aberturas A/B sugeridas pela IA, pós-visita e primeiro contato automático pelo tique dos follow-ups (26/09)
- [[aprimoramentos-das-oito-funcionalidades]] — A/B que decide sozinho e reescreve a fila, vencedoras como exemplo, pós-visita que puxa o próximo passo, lead pago sem contato em 30 min (26/09)
- [[fechar-o-ciclo-e-ligar-a-plataforma]] — público compradores, reengajamento descartado para quem fechou, pedido de indicação no tique (26/09)
- [[impulsionamento-do-corretor-pela-etiqueta-da-meta]] — lead do impulsionamento do corretor era descartado pela 0111; etiqueta da Meta abre a porta, gasto digitado em Marketing → Impulsionamentos (27/09)
- [[lead-da-campanha-do-corretor-sem-ia]] — lead da campanha do próprio corretor: a IA não responde, só cadastra e resume (20/10); sem boas-vindas automática (27/10)
- [[campanha-cadastrada-pelo-corretor]] · [[lead-do-link-do-anuncio-cai-na-campanha-do-imovel]] · [[clique-no-link-cadastra-quem-escreve]] · [[anuncio-da-etiqueta-cai-sozinho-na-campanha]] — o corretor cadastra campanha com valor, agrupa anúncios, liga clientes; qualidade pela temperatura da IA e comparação pela melhor por visita (0132, 30/09)
- [[onde-o-clique-do-anuncio-se-perde]] — pessoas por clique e quem escreveu sem a mensagem pronta, só contagem (0159, 05/10)
- [[qualidade-do-lead-pelo-que-ele-fez]] — qualidade por degraus de comportamento (conversou, se qualificou, visitou, fechou), contagem abaixo de 5 clientes, comparativo entre campanhas (30/09)
- [[comparacao-de-campanhas-por-um-criterio-so]] — ordem e "melhor" pelo mesmo critério (visita → qualificado → cliente), amostra mínima de 5, quem gastou sem trazer ninguém aparece (30/09)
- [[totais-dos-anuncios-contam-e-dividem-o-mesmo]] — contagem e custo do topo usam só as campanhas com gasto; degraus com custo de cada um (30/09)
- [[lista-de-transmissao-visivel-e-controlavel]] — gaveta de quem recebeu, pausar/retomar/cancelar por lista (0153), linha na ficha, contexto da lista para a IA, guarda de 24h de conversa do corretor, recorte por canal/anúncio e visitas/vendas depois (03/10)
- [[roleta-dos-anuncios]] — lead de anúncio vai para o próximo da lista do dono; o número novo chama o cliente na hora (20/10)
