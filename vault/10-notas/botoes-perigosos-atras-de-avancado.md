---
title: Botão destrutivo não fica no mesmo nível do resto
aliases: [Limpar fila, Resetar cota, + Avançado]
tags: [painel, campanhas, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [src/app/corretor/(painel)/campanhas/CampanhasManager.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso F4
summary: "Limpar fila apaga sem desfazer; Resetar cota afrouxa o anti-ban de propósito. Foram para trás de + Avançado. Resetar cota é TEMPORÁRIO e não toca conectado_em."
---
# Botões perigosos atrás de "+ Avançado"

- **"Limpar fila"** (`limparFilaDisparo`): apaga só o que ainda não saiu
  (`pendente` e `erro`). `enviado` e `respondido` são histórico do atendimento
  — o Live Chat e a linha do tempo são feitos deles. Apaga em vez de marcar
  "cancelado" ([[dado-gravado-e-nao-exibido-e-dado-perdido]]). Campanha que
  fica sem pendência é fechada junto, senão seguiria "em andamento" prometendo
  disparo que não existe.
- **"Resetar cota"** (`resetar_cota_campanha`, 0034): **temporário**, pedido
  para a fase de teste. Afrouxa a proteção anti-ban de propósito. **Não toca
  `conectado_em`** — zerá-lo reiniciaria a curva de aquecimento e daria cota
  MENOR. Para remover: função no banco + action `resetarCotaDisparo` + botão em
  `CampanhasManager.tsx`.

Nenhuma das duas é rotina, e botão destrutivo no mesmo nível do resto é
convite ao clique errado.

## Linguagem do status da fila

"Hoje saem 15 mensagens; as outras 32 continuam amanhã, sozinhas" no lugar de
pendentes/cota/próximo envio. Cota, fila e instância são vocabulário de quem
construiu o sistema; o anti-ban é explicado como CUIDADO com o número do
corretor.

## Relacionadas
- [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]
- [[navegacao-do-painel-tem-regua]]
