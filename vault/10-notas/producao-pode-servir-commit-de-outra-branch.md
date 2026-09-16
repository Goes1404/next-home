---
title: Produção pode estar servindo commit de outra branch, e o push para a main regride
aliases: [promoção pelo painel, regressão de 6 minutos, conferir o que está servindo]
tags: [infra, licao]
type: nota
status: evergreen
custou: alto
codigo: []
created: 2026-09-16
updated: 2026-09-16
fonte: deploy de 16/09/2026, medido na API de deployments do GitHub
summary: A branch de produção é a documentada, mas quem estava NO AR era um commit de outra branch, promovido pelo painel. O push para a main deployou por cima e apagou quatro commits alheios por seis minutos. O que responde antes de subir não é qual branch é a de produção — é qual commit está servindo.
---
# Produção pode servir commit de outra branch

## O que aconteceu

A regra da casa manda subir para as duas branches (`main` e
`claude/modernizar-plataforma-imobiliaria-2tm13q`), e foi o que se fez. Só que
o que estava **no ar** era `62f5a54`, de uma terceira branch
(`claude/eduardo-email-senha-update-y6408k`), **promovido pelo painel** quatro
horas depois do próprio preview.

O push auto-deployou produção a partir da `main`. Resultado medido:

| horário (UTC) | o quê |
|---|---|
| 02:35 | `62f5a54` promovido à produção, de outra branch |
| 04:42:35 | meu `cb4688e` vira produção pela `main` — **sem** os 4 commits deles |
| 04:48:53 | `53112ac` (com o merge deles) vira produção |

**Seis minutos** em que produção perdeu o vídeo de fundo do celular e a rota
`/api/versao`, sem ninguém pedir.

> **Antes de subir, a pergunta não é "qual é a branch de produção" — é "qual
> COMMIT está servindo".** As duas respostas divergem sempre que alguém promove
> um preview pelo painel, e a promoção não deixa rastro em branch nenhuma.

## Como se responde, sem o MCP da Vercel

O repositório é público, então a API de deployments do GitHub basta:

```
curl -s "https://api.github.com/repos/<org>/<repo>/deployments?per_page=8"
```

Cada push gera um registro `Preview` e, se for a branch de produção, um
`Production` cerca de **70 segundos depois**. Duas armadilhas:

- **Consultar cedo demais imita exatamente uma recusa.** Nesta sessão o
  `Production` do `cb4688e` não existia às 04:41:33 e existia às 04:42:35. A
  primeira leitura quase virou o diagnóstico errado.
- **A lista de deployments não diz o `state`.** Um registro pode existir e ter
  falhado; o estado vem de `statuses_url`.

## A prova que vale é FUNCIONAL, não o registro

O registro diz que o deploy saiu; ele não diz o que sumiu. O que fechou o caso
foi uma rota que só existe do lado deles:

```
curl -s -o /dev/null -w '%{http_code}' https://next-home-drab.vercel.app/api/versao
```

404 enquanto produção era meu commit, 200 depois do merge. **Escolha, antes de
subir, um endereço que exista só no trabalho alheio** — ele responde em uma
linha se você regrediu alguém.

## O conserto, e o que continua em aberto

O conserto foi merjar o commit que estava no ar (`62f5a54`) e subir de novo —
nunca `--force`. Ficou de fora de propósito o que eles ainda não promoveram
(`1543f1e`, `c148b2e`, em preview): promover trabalho alheio é decisão deles.

Continua em aberto o de sempre nesta base: enquanto a promoção pelo painel for
o caminho normal, a branch de produção documentada descreve a intenção, não o
estado. Ver [[subir-com-outra-sessao-a-frente]] e
[[a-skill-a-vista-sem-tirar-a-visao-do-tradutor]].
