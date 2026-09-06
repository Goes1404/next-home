---
title: A trava era aberta por padrão, e a palavra-chave não ativava
aliases: [IA responde todo mundo, exigeLiberacaoExplicita, IA assume agora]
tags: [ia, whatsapp, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/modoBot.ts, src/lib/whatsapp/repositorio.ts, src/app/corretor/(painel)/conversas/acoesIA.ts, supabase/migrations/0098_ia_so_para_cliente_conhecido.sql, src/lib/whatsapp/ativacaoIa.test.ts]
created: 2026-09-06
updated: 2026-09-06
fonte: incidente de produção, 05-06/09/2026
summary: Dois defeitos distintos com o mesmo relato — trava padrão-aberto sem palavra cadastrada (todo desconhecido liberado) e ativação que escrevia 1 das 3 condições de botDeveResponder.
---
# A trava era aberta por padrão, e a palavra-chave não ativava

Relatado: "a IA responde todo mundo" + "a palavra-chave não funciona". Dois
defeitos **diferentes**:

## 1. Padrão-aberto

`exigePalavraChave` devolvia `false` sem palavra válida cadastrada →
conversa nova de desconhecido nascia `liberado = true`. E a decisão é
**congelada no INSERT**: toda conversa anterior à trava (0023) ficou
liberada para sempre.

Hoje `exigeLiberacaoExplicita`: desconhecido trava SEMPRE. Abrem a porta:
cliente já no CRM antes da conversa, campanha, anúncio, frase de entrada,
palavra-chave, ou os botões do painel. A migration 0070 retrava o passado.

## 2. Ativação que escrevia 1 de 3 colunas

`botDeveResponder` exige **três** condições (bot ativo, pausa vencida,
liberada). A palavra-chave escrevia só a trava — e a fala anterior do
corretor já tinha pausado por 24h: no fluxo real ("atendo → digito 'pode
assumir'") a IA seguia muda. **Segunda vez** que um caminho de ativação
escreve menos colunas do que o gate lê (a primeira foi o botão "reativar" —
[[trava-de-palavra-chave-e-cliente-conhecido]]).

`ativacaoIa.test.ts` lê o código e exige os três campos em todo caminho de
ativação ([[testes-que-leem-o-codigo]]).

## Os botões novos

- **"IA assume agora"** (Conversas): liga as três condições e, se a última
  fala é do cliente, **responde na hora** — assumir e ficar mudo parecia
  botão quebrado.
- **"Iniciar conversa com IA"** (ficha do lead): abre a conversa e manda a
  apresentação. Abertura é iniciativa nossa → `reservarCotaCampanha`
  (cota + espaçamento — [[espacamento-anti-ban-so-existia-no-papel]]),
  tentativa de contato e avanço de funil
  ([[campanha-tambem-mexe-no-funil]] — 4º arquivo no teste). A janela de
  horário não barra o clique: corretor logado é a classe do Live Chat.
- `ia_interacoes.origem` ganhou `'painel'` (CHECK na 0098 + types.ts à mão
  — [[regenerar-types-nao-e-so-rodar-o-gerador]]).

E o texto "Em branco, a IA responde normalmente" da tela de configuração —
**sexta** ocorrência de texto desatualizado apontando diagnóstico errado —
foi reescrito junto.

## Relacionadas
- [[trava-de-palavra-chave-e-cliente-conhecido]]
- [[falha-calada-e-a-pior]]
- [[MOC — IA e Atendimento]]
