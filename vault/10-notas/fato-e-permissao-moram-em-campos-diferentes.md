---
title: Fato e permissão moram em campos diferentes
aliases: [atendida_em, retravamento, janela de 40, dossiê que se apaga]
tags: [ia, banco, decisao]
type: nota
status: growing
custou: alto
codigo:
  - supabase/migrations/0106_conversa_atendida_em.sql
  - src/lib/whatsapp/privacidadeDaConversa.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/mesclarDossie.ts
created: 2026-09-10
updated: 2026-09-10
fonte: docs/superpowers/specs/2026-09-10-contexto-da-ia-design.md + medição no banco
summary: O retravamento tirava a PERMISSÃO e, junto, o FATO — a conversa parava de guardar texto. Separar exigiu coluna nova; reusar cliente_conhecido teria desligado a proteção.
---

# Fato e permissão moram em campos diferentes

## O problema

A instância roda no WhatsApp **pessoal** do corretor. A cada fala dele que não
é a palavra-chave, `decidirPorFalaDoCorretor` RETRAVA a conversa — é isso que
impede a IA de assumir a conversa da família (o caso real da conversa da mãe
dele). Só que travada, a conversa também parava de **guardar o texto** do
cliente.

Ele manda ~373 mensagens por semana do próprio celular. Medido antes da 0106:
**2.431 falas gravadas em branco**, e o buraco é de um lado só — a fala do BOT
nunca fica em branco, porque ele só fala liberado. Quando a conversa destrava,
a IA lê um histórico furado **e assimétrico**.

## A separação, e por que ela precisa de coluna nova

`whatsapp_conversas.atendida_em` guarda o FATO: a IA atendeu esta conversa
alguma vez. `conversaEhAtendimento` ganha a quarta porta e o texto volta a ser
guardado. A PERMISSÃO não muda: `exigeLiberacaoExplicita` e `motivoDoSilencio`
não leem a coluna, e conversa retravada segue muda até alguém liberar.

**A tentação era reusar `cliente_conhecido`** — e teria desligado o
retravamento junto, porque é ela que `exigeLiberacaoExplicita` lê. Ou seja: a
opção mais barata era exatamente a que o usuário descartou.

> Dois conceitos só podem DISCORDAR se morarem em campos diferentes. Quando o
> recurso É a discordância, reusar campo não é economia — é desfazer o
> recurso.

O teste central prova o par, não uma metade: a mesma conversa **continua
retravada** e **continua guardando texto**. Um teste só de um lado não
distinguiria esta correção da opção descartada.

## Carimbo de fato: uma vez só

`update … where atendida_em is null`. Reescrever a cada resposta faria a marca
mentir sobre QUANDO o atendimento começou — a mesma razão de `desconectado_em`
(0071) ser gravado uma vez e não a cada tique do cron.

Backfill medido: 90 das 140 conversas receberam a data da primeira fala do
bot. Conferido nos dois sentidos: **12 delas seguem retravadas** (a permissão
não mudou) e as 78 liberadas continuam 78.

## A janela: 40 falas COM TEXTO

`historicoRecente` foi de 20 para 40 e passou a descartar a marca **na própria
consulta**. A marca existe para a TELA não parecer defeito; no prompt ela não
ensina nada e gastava um dos lugares para dizer "aqui havia algo que você não
pode ler" — e havia conversa com 53 delas em 209 mensagens.

Medido no banco, sobre as mesmas 15 conversas longas: **8,8 → 20,8 falas
úteis** (2,36x).

### O efeito colateral que quase criou um número morto

Com a janela descartando a marca, `ia_interacoes.contexto.emBranco` (0105,
subiu no mesmo dia) passaria a **viver em zero**. Ele passou a contar a
CONVERSA, via `contarFalasNaoGravadas` (`head: true`).

> Número que vive em zero ensina a ignorar o número — a mesma régua do
> contador de aba e do cartão de pendência. **Ao mudar o que uma consulta
> traz, procurar quem CONTA em cima dela.**

## O dossiê se apagava sozinho

`salvarDossie` fazia upsert com TODAS as colunas, e a extração só enxerga a
janela: assunto que saía dela voltava `null`, e o null sobrescrevia o que o
cliente já tinha dito. `leads` ganhou essa guarda em 24/08; o dossiê nunca
ganhou — daí **16 dossiês para 131 leads**, com orçamento 0/16.

A regra é **`null` não apaga**, com duas exceções declaradas:

- **temperatura e resumo SEMPRE sobrescrevem** — são leitura do momento, não
  fato acumulado. Preservar o score antigo faria o termostato do
  `evolucaoConversa` comparar com um número que já não existe, e um lead que
  esfriou tem de aparecer esfriando.
- **lista vazia não apaga; lista cheia SUBSTITUI, nunca une** — união
  guardaria objeção já superada, e objeção morta no dossiê manda a IA tratar
  um problema que o cliente esqueceu, o que do lado dele soa como não ter sido
  ouvido.

**A leitura da linha anterior mora DENTRO de `salvarDossie`**, não no
chamador. O webhook tem um `dossieAnterior` em mãos, e passá-lo economizaria
uma consulta — ao custo de a guarda depender de alguém lembrar. É o
esquecimento de chamador que tirou `interacaoId` dos parâmetros de
`gravarMensagem`.

## Duas lições de método desta rodada

- **A colisão de número de migration aconteceu de novo** — ver
  [[colisao-de-migration-entre-branches]]. A spec reservou `0103`, já ocupado
  por `parametros_credito`; saiu como `0106`. Vale o registro de que desta vez
  ela apareceu num documento APROVADO, escrito antes de o número ser tomado:
  spec não é código, ninguém a compila, e o número envelhece sozinho.
- **Oitava vez que uma guarda tropeça no próprio recorte.** A do dossiê ia do
  `.upsert(` até o fim da função e reprovava a gravação legítima do orçamento
  em `leads`. Recortar a CHAMADA, não o resto.

## Relacionadas
- [[MOC — IA e Atendimento]]
- [[MOC — Banco de Dados]]
- [[privacidade-apaga-o-que-a-ia-depois-precisa]]
- [[o-contexto-da-decisao-da-ia]]
- [[colisao-de-migration-entre-branches]]
