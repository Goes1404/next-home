---
title: A aba aberta é que carrega a versão antiga
aliases: [versão antiga no navegador, aviso de build nova, /api/versao, NEXT_PUBLIC_BUILD_ID]
tags: [infra, armadilha]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/versao/versaoDaBuild.ts
  - src/app/api/versao/route.ts
  - src/components/layout/AvisoDeVersaoNova.tsx
  - next.config.ts
created: 2026-09-15
updated: 2026-09-15
fonte: relato do usuário (15/09/2026) + medição de cabeçalhos em produção
summary: Não é cache de HTML — o HTML sai `no-store` em toda rota. Quem segura a versão antiga é a ABA que nunca renavegou, e nada avisava a ela que havia build nova. Colar o link funcionava porque colar o link é uma navegação.
---
# A aba aberta é que carrega a versão antiga

Relatado assim: *"os navegadores carregam a versão antiga, e precisamos
colar o link no Google para abrir a nova"*.

## A causa provável estava errada, e medir custou três comandos

| candidato | medido em produção | veredito |
|---|---|---|
| cache de HTML | `private, no-cache, no-store` + `X-Vercel-Cache: MISS` em `/`, `/empreendimentos`, `/financiamento`, `/corretor/entrar` | **não é** |
| service worker | `grep serviceWorker\|workbox\|next-pwa` = zero | **não existe** |
| chunk imutável | `max-age=31536000, immutable`, mas o nome carrega hash por build | **não é** |

O HTML nunca é cacheado porque toda rota deste site é dinâmica — o
`cookies()` do layout raiz, que existe para o tema. Ou seja: **navegação de
verdade SEMPRE traz a versão nova**, e é exatamente por isso que o contorno
que a equipe descobriu funciona. Colar o link é uma navegação.

## O que sobra é a aba

A aba que já estava aberta guarda em memória o HTML e o JavaScript do build
anterior, e não pede nada ao voltar do segundo plano — no celular ela fica
suspensa por horas. Nada nesta aplicação dizia a ela que havia build nova.

E ela não fica só desatualizada: **quebra**. Medido — chunk que não existe
mais responde 404, e a Server Action dela também. Esse segundo caso já era
tratado por [[action-de-outro-build-vira-sem-conexao]], mas só **depois** que
a pessoa tenta agir e falha. Faltava o aviso antes do erro.

## A correção, e as quatro decisões que a sustentam

`/api/versao` devolve o carimbo da build no ar; a aba pergunta ao voltar do
segundo plano, com relógio de 15 min para quem fica com a aba na frente, e
o erro de chunk como gatilho extra. Carimbos diferentes acendem uma faixa
que oferece recarregar.

- **Nunca recarrega sozinho.** Recarregar por conta própria perde o pedido
  meio digitado no Estúdio ou o filtro montado na lista. O que faltava era
  **saber**, não decidir pela pessoa.
- **Cala em dúvida.** Rede fora, resposta torta, carimbo ausente ou `dev`
  não anunciam nada. O lado errado de errar aqui é o falso positivo: um
  "atualize" sem deploy nenhum ensina a ignorar o aviso — a régua que este
  projeto aplica desde o alerta de evolução da conversa.
- **O carimbo é DETERMINÍSTICO** (os 12 primeiros dígitos do commit). O
  `next.config` é avaliado por mais de um processo — o build e a função em
  runtime —, e um valor calculado na hora (`Date.now()`, um sorteio) faria
  cliente e servidor discordarem **dentro da mesma build**: a faixa ficaria
  na tela para sempre, sem deploy nenhum.
- **A rota é `no-store` e não toca no banco.** Cacheada, ela devolveria o
  carimbo velho e o recurso inteiro viraria decoração — com build verde,
  tela funcionando e nenhum erro em lugar nenhum. É o padrão que esta base
  mais repete, e por isso a guarda de código-fonte cobra as duas coisas.

## Por que o `env` do `next.config` resolve o pareamento

A documentação do `env` garante que o Next **substitui a expressão pelo
literal em tempo de build**, nos dois pacotes — cliente e servidor. É isso
que impede a aba e a rota de discordarem dentro da mesma build, mesmo que o
`next.config` seja reavaliado em runtime.

Conferido, não suposto: build com `VERCEL_GIT_COMMIT_SHA=abcdef0123456789`
deixa `abcdef012345` tanto em `.next/static/chunks/` quanto no chunk de
servidor, e `/api/versao` no build responde `{"versao":"abcdef012345"}` com
`cache-control: no-store, max-age=0`.

## O que foi verificado no navegador, em 390px

| cenário | resultado |
|---|---|
| servidor na mesma versão da aba | nenhuma faixa |
| servidor com carimbo diferente | faixa com "O aplicativo foi atualizado…" |
| alvo do botão "Atualizar agora" | 143×44 px |
| largura do documento | 390 contra 390 de tela — sem estouro |
| "Agora não" | some e não volta |

## A faixa fica no TOPO, e o custo está declarado

Ela cobre a parte de cima do cabeçalho enquanto está na tela. O rodapé
estava ocupado por **quatro** elementos fixos — botão de WhatsApp, voltar ao
topo, navegação do painel e a região de avisos, todos em `acima-da-nav` — e
empilhar um quinto ali é como um toque acaba no alvo errado. Sendo rara,
dispensável e de uma linha, o topo é o lugar honesto.

`fixed` direto no `<body>`: nenhum ancestral ali tem `backdrop-filter`, que
é a armadilha de containing block que este projeto já pisou seis vezes.

## A guarda tropeçou no próprio comentário — quarta vez nesta base

A checagem "a rota não toca no banco" reprovou a rota **certa**, porque o
comentário dela explica que a resposta "não lê arquivo, cookie nem
Supabase". A palavra estava lá; o código, não. Teste que lê código-fonte
remove comentário antes de acusar — mesma pedra de `tokensDeTema`,
`escalaDoPainel` e `gravacaoDeMensagem`.

As três mordidas (tirar o `no-store`, tirar o `force-dynamic`, fazer a rota
ler o banco) foram provocadas com md5 antes e depois, e as três reprovaram.

## Achado de passagem, NÃO corrigido

`nexthomeimobiliaria.com.br` continua resolvendo para `187.45.195.126`
(Apache) e servindo o **site legado**. É uma segunda fonte legítima de
"versão antiga" — e a única que nenhuma faixa dentro da aplicação alcança,
porque a aplicação não está lá. É virada de DNS mais `NEXT_PUBLIC_SITE_URL`,
como [[seo-a-regua-de-titulo]] já registra.

## Relacionadas
- [[action-de-outro-build-vira-sem-conexao]] — o mesmo defeito, tratado depois do erro
- [[o-site-publico-nao-vai-mais-ao-banco-por-requisicao]] — por que o HTML sai `no-store`
- [[MOC — Infraestrutura]]
