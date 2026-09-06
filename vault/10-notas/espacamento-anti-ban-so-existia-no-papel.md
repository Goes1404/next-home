---
title: O espaçamento anti-ban não valia no envio
aliases: [rajada, mensagens saindo todas de uma vez]
tags: [anti-ban, campanhas, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/campaignDispatcher.ts, supabase/migrations/0062_espacamento_no_envio.sql, supabase/migrations/0063_ponte_espacamento_funcao_antiga.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — espaçamento anti-ban (28/08/2026)
summary: O intervalo de 35-75s era calculado na criação e gravado em agendado_para; item VENCIDO saía na hora. 15 mensagens de 14 min saíram em 57 segundos. Dois números restringidos.
---
# O espaçamento anti-ban não valia no envio

Relatado como "as mensagens estão saindo todas de uma vez, e isso causa ban" —
depois de **dois números restringidos** em teste. Estava certo.

## O defeito

O intervalo de 35-75s era calculado na criação da campanha e gravado em
`whatsapp_campanhas_fila.agendado_para`. O disparador respeitava esse horário
**pela metade**: item no futuro, ele esperava; item **vencido** tinha espera
negativa e saía na hora — e o seguinte, e o seguinte.

Medido na campanha e59c871a: 15 mensagens agendadas ao longo de 14 minutos
saíram em **57 segundos**, com 2 a 5 segundos entre elas.

A proteção só valia para a fila **em dia** — justamente o caso que não precisa
de proteção. Bastava o disparador ficar parado (número desconectado, fora da
janela, cota, deploy) para a fila inteira vencer junto e sair em rajada no
retorno. O teto de 3 itens por chamada não segura: o auto-encadeamento chama a
si mesmo em seguida.

## A correção (0062): trava no BANCO

**Piso de tempo que depende do chamador não é piso, é convenção.** A trava é
carimbada no mesmo UPDATE atômico que consome a cota
(`proximo_envio_permitido_em`) — mesmo motivo da cota morar lá: pg_cron,
corrente da Vercel e botão do painel tocam a mesma fila, e ler-somar-gravar da
aplicação perde a corrida.

Decisões que acompanham:

- **Cobre os dois caminhos que iniciam contato**: campanha e follow-up já
  passavam por `reservarCotaCampanha`. Caminho novo que fala com o cliente por
  iniciativa nossa passa por ali.
- **O sorteio do intervalo mudou de lugar**: a cada concessão, não na criação —
  cadência exata de 35s é tão reconhecível quanto rajada.
- **[[o-lado-certo-de-errar-numa-trava]]**: erro do banco ou resposta vazia
  recusam o envio.
- **Aguardar não é processar**: contar a espera como item processado fazia a
  chamada devolver "3 processados, 0 enviados" e encerrar a vaga.
- **Follow-up recusado por espaçamento é PULADO, não descartado** — descartado
  não volta; uma campanha falando 40s antes apagaria um follow-up legítimo.

## Migration aplicada ≠ produção protegida (0063)

Entre aplicar a 0062 e o deploy sair, a produção seguia chamando
`consumir_cota_campanha` (sem trava). A 0063 endurece a função **antiga**: ela
não sabe dizer "espere 40s" (devolve inteiro), então responde `-1`, que o
código antigo lê como cota atingida e usa para parar. Rótulo impreciso no
painel por algumas horas, comportamento correto.

**Ao corrigir defeito de segurança que vive numa função do banco, endurecer a
função que a produção AINDA chama, não só a nova.**

## Diagnóstico

Rajada não aparece em `agendado_para`, que continua perfeito. Só aparece
comparando `enviado_em` com `lag(enviado_em)` da mesma campanha. Contar
intervalos abaixo de 30s é a medida que importa.

## Relacionadas
- [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]
- [[numero-sem-whatsapp-nao-e-falha-nossa]] — cota reservada antes e devolvida
