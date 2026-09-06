---
title: O calendário do prompt misturava dois fusos — e quebrava 3h por noite
aliases: [toISOString, sábado com data de domingo]
tags: [prompt, ia, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/coerenciaVisita.ts, src/lib/whatsapp/calendario.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Disparo de campanhas
summary: Rótulo em São Paulo, data em UTC — das 21h à meia-noite o prompt afirmava "sábado, 29/08 = 2026-08-30". O mesmo modelo passava no benchmark às 20h e reprovava às 21h.
---
# O calendário misturava dois fusos

`calendarioProximosDias` formatava o rótulo em São Paulo e a data ao lado com
`toISOString()` (UTC). Das 21h à meia-noite de Brasília o servidor já virou o
dia, então o prompt afirmava coisas como *"sábado, 29/08 = 2026-08-30"* —
ensinando ao modelo que sábado tem a data de domingo.

O modelo obedecia, `coerenciaVisita` descartava a proposta, e o cliente que
pediu sábado terminava sem visita — justo nas horas de maior movimento.

**Como apareceu**: o MESMO modelo passou no benchmark às 20h e reprovou às
21h — variância que não era do modelo.

## O sábado que já passou

Modelo escolhe o sábado que JÁ PASSOU quando o cliente pede "sábado" — medido
em três modelos da OpenAI no mesmo dia, com o prompt já mandando "nunca
proponha um dia que já passou". Instrução de prompt é probabilística
([[voz-humana-e-funcao-nao-prompt]]). `corrigirVisitaNoPassado` rola para a
próxima ocorrência — e só quando o dia da semana bate com o que o texto
prometeu; divergência real continua descartada.

## Fuso reaparece no painel

O recorte "Hoje" da lista de leads calcula o dia em SP (`diaEmSaoPaulo`) —
mesma armadilha.

## Relacionadas
- [[visita-e-gravada-com-validacao]]
