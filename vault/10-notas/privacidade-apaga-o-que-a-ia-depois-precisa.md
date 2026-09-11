---
title: A privacidade apaga o texto que a IA depois vai precisar ler
aliases: [mensagem não gravada, retravamento, buraco no histórico]
tags: [ia, lgpd, medicao]
type: nota
status: evergreen
custou: medio
codigo:
  - src/lib/whatsapp/privacidadeDaConversa.ts
  - src/lib/whatsapp/modoBot.ts
  - src/lib/whatsapp/repositorio.ts
created: 2026-09-10
updated: 2026-09-11
fonte: medição de 10/09/2026 sobre conversas atendidas pelo bot
summary: Conversa que trava e destrava várias vezes acumula falas do cliente gravadas em branco. Depois de liberada, a IA lê um histórico furado — 32% das falas do cliente em conversas atendidas.
---
# A privacidade apaga o que a IA depois precisa

> **Superada para números desconhecidos pela 0111.** Eles não geram mais nem
> linha de conversa. O histórico abaixo explica o desenho anterior e ainda é
> útil para compreender marcas legadas e testes do contrato de gravação.

A regra de 01/09 está certa e continua valendo: conversa nunca liberada guarda
a LINHA, não o texto. O que ninguém previu é o **vaivém**.

`decidirPorFalaDoCorretor` RETRAVA a conversa a cada fala do corretor que não
seja a palavra-chave — e ele manda ~373 mensagens por semana do próprio
celular. Enquanto está travada, o cliente continua escrevendo, e cada fala vai
para o banco como `[mensagem não gravada — conversa sem atendimento liberado]`.
Quando alguém destrava de novo, **o passado já é irrecuperável**.

## Medido em 10/09/2026

- **1.007 de 3.181 falas do cliente (32%)** estão em branco em conversas nas
  quais o bot já falou. Dez conversas afetadas.
- Numa delas, 53 de 209; noutra, 14 de 21 — dois terços do que o cliente disse.
- As falas do BOT nunca ficam em branco (ele só fala quando está liberado), o
  que deixa o histórico assimétrico: ela se lê inteira e lê o cliente pela
  metade.
- As cinco conversas com mais respostas do bot e `cliente_conhecido = false`
  estão todas retravadas hoje — e todas têm lead no CRM.

## O que a marca custa no prompt

Fora o buraco, a linha entra no prompt como TEXTO: 88 das 315 falas medidas
eram a própria marca. Ela ocupa lugar na janela de 20 e não ensina nada.

## Candidatos de conserto (não decididos)

1. **Conversa que já foi atendida não retrava** — `cliente_conhecido` passa a
   ser escrito quando a IA atende, do jeito que já acontece para campanha
   (`marcarConversaComoAtendimento`).
2. **A marca não vai ao prompt.** Barato, sem decisão de produto envolvida.
3. **Dossiê que não se sobrescreve com `null`** — a memória longa é o que
   deveria sobreviver ao buraco.

## Relacionadas
- [[conversa-pessoal-do-corretor-e-gravada]]
- [[o-contexto-que-a-ia-realmente-ve]]
- [[MOC — IA e Atendimento]]
