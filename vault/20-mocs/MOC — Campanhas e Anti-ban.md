---
title: MOC — Campanhas e Anti-ban
tags: [moc, campanhas, anti-ban]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-11
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

## Diagnóstico
- [[fila-parada-tres-causas]] ⚠️ runbook principal
- [[numero-sem-whatsapp-nao-e-falha-nossa]]
- [[envio-mandava-telefone-sem-ddi]]

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
- [[campanha-cadastrada-pelo-corretor]] · [[lead-do-link-do-anuncio-cai-na-campanha-do-imovel]] · [[clique-no-link-cadastra-quem-escreve]] · [[anuncio-da-etiqueta-cai-sozinho-na-campanha]] — o corretor cadastra campanha com valor, agrupa anúncios, liga clientes; qualidade pela temperatura da IA e comparação pela melhor por visita (0132, 30/09)
- [[qualidade-do-lead-pelo-que-ele-fez]] — qualidade por degraus de comportamento (conversou, se qualificou, visitou, fechou), contagem abaixo de 5 clientes, comparativo entre campanhas (30/09)
- [[comparacao-de-campanhas-por-um-criterio-so]] — ordem e "melhor" pelo mesmo critério (visita → qualificado → cliente), amostra mínima de 5, quem gastou sem trazer ninguém aparece (30/09)
- [[totais-dos-anuncios-contam-e-dividem-o-mesmo]] — contagem e custo do topo usam só as campanhas com gasto; degraus com custo de cada um (30/09)
- [[lista-de-transmissao-visivel-e-controlavel]] — gaveta de quem recebeu, pausar/retomar/cancelar por lista (0153), linha na ficha, contexto da lista para a IA, guarda de 24h de conversa do corretor, recorte por canal/anúncio e visitas/vendas depois (03/10)
