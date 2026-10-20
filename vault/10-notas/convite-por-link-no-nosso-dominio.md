---
title: Convite por link no nosso domínio
tags: [supabase, armadilha]
type: nota
status: growing
custou: alto
codigo:
  - src/lib/auth/links.ts
  - src/lib/auth/linkPendente.ts
  - src/app/auth/confirmar/route.ts
  - src/app/auth/continuar/acoes.ts
  - src/lib/auth/sessaoPorLink.ts
  - src/app/corretor/definir-senha/acoes.ts
  - src/lib/corretores/convite.ts
  - src/app/plataforma/acoes.ts
  - docs/CONVITE-E-EMAIL.md
  - src/lib/auth/pedidoDeLinkDeSenha.ts
  - src/app/corretor/(painel)/admin/acoes.ts
created: 2026-10-19
updated: 2026-10-20
summary: Fase 2A — o acesso ao painel é por link de convite/recuperação no nosso domínio (token_hash), gasto só num botão; a tela de criar senha vale só para a sessão do link (amr otp, 15 min). Armadilhas do action_link, do scanner de e-mail, do GoTrue e do ilike do PostgREST.
---

# Convite por link no nosso domínio

Fase 2A da [[plataforma-multi-grupo]]: acabou a senha provisória. Quem entra
recebe um link e cria a própria senha. Passo a passo para ligar o e-mail:
`docs/CONVITE-E-EMAIL.md`.

## O link é nosso, não o do Supabase

- O `action_link` do `generateLink` passa por `/auth/v1/verify` e devolve o
  token no **fragmento** (`#access_token=…`), que nunca chega ao servidor.
- O fluxo PKCE do `@supabase/ssr` guarda o verificador num cookie do
  navegador que **pediu** o link: o gestor convida no computador, o corretor
  abre no celular, e não há verificador ali.
- O que funciona: o `hashed_token` na query de uma rota nossa
  (`/auth/confirmar?token_hash=…&type=…&next=…`), e `verifyOtp({ type,
  token_hash })` no servidor.

## O scanner de e-mail gasta o token

Safe Links do Microsoft 365, antivírus e pré-visualizadores abrem o link
antes da pessoa. Se o GET gastasse o token, o clique de verdade cairia em "já
usado". Por isso o GET só **guarda** o link (cookie `httpOnly`, caminho
`/auth`, 15 min) e manda para `/auth/continuar`, um botão. O token só é
gasto no POST do botão, que scanner não faz.

- `NextResponse.redirect(new URL(x, request.url))` mandava para `localhost`
  quando o navegador tinha aberto `127.0.0.1` (e atrás de proxy pode trazer o
  host interno): o cookie do link se perdia. A rota responde com `Location`
  **relativo**.

## Criar senha sem a atual só na sessão do link

`/corretor/definir-senha` não pede a senha atual. Sem trava, qualquer sessão
(inclusive roubada) trocaria a senha pela URL. Agora só passa a sessão cujo
claim `amr` diz que nasceu de um link há menos de 15 min
(`sessaoAbertaPorLink`, lido por `getClaims`); o resto vai para
`/corretor/senha?link=vencido`, que pede a atual.

- **Medido no Auth local (19/10):** convite E recuperação com `token_hash`
  gravam `amr: [{ method: "otp", timestamp }]`, não `invite`/`recovery`.
  O `timestamp` é o do link; renovar a sessão não o empurra.
- `Date.now()` no corpo de Server Component reprova no lint
  (react-hooks/purity): o relógio mora na função, como parâmetro padrão.

## GoTrue reaproveita usuário não confirmado

`generateLink('invite')` com um e-mail de convite pendente devolve o
**mesmo** usuário. Vincular bateria no `unique` de `user_id`, e a
compensação apagaria o login pendente de outra ficha. O convite confere se o
`user_id` já é de outra ficha antes de vincular. Se essa conferência falha
por erro transitório, o convite devolve `loginNaoConferido`, e o desfazer da
plataforma confere de novo e só apaga o login se ele não for de ficha
nenhuma.

## `ilike` do PostgREST: o `*` não tem escape

Para comparar e-mail sem diferença de maiúsculas, o padrão escapa `%`, `_` e
a barra (`padraoDoEmail`). Mas o PostgREST troca **todo** `*` por `%` antes
do Postgres, inclusive o escapado (`\*` vira `\%`, um `%` literal). O `*`
vira `_`: casa com o próprio `*`. Conferido contra o PostgREST local.

## O desfazer do grupo deixa rastro

Ficha ou convite falhando, o grupo é desfeito na ordem de
`ORDEM_DO_DESFAZER` (a mesma constante que o teste de banco percorre). Os
eventos do grupo saem junto com ele, então fica UM evento da plataforma:
`grupo_desfeito`, `grupo_id` nulo, `detalhes.origem = 'plataforma'`, com o
endereço e o passo — sem e-mail nem nome.

## A chave pública lia o e-mail real

Com e-mail real na ficha, a policy pública de `corretores` deixava o `anon`
ler `email`, `user_id` e `deve_trocar_senha`. A 0196 troca o grant de tabela
por grant de colunas (as que o site mostra). Mesma migration: `grupos` só
mostra ao logado as colunas básicas; documento, cobrança e LGPD ficam para a
chave de serviço.

## O que é configuração de produção, não código

- **OTP expiry = 86400** (24 h) no painel do Supabase. O `config.toml` local
  já tem; produção não lê esse arquivo. Vale para convite e recuperação.
- **Site URL e Redirect URLs** com `<site>/auth/confirmar`. O GoTrue local
  aceitou `redirectTo` fora da lista; produção conferir uma vez.
- `RESEND_API_KEY` e `EMAIL_REMETENTE` na Vercel, e redeploy. Sem a chave, o
  convite não falha: a tela mostra o link para copiar.
- No DNS da Hostinger, o campo **Nome** já completa o domínio: digitar
  `send.nexthomeimoveis.com` cria `send.nexthomeimoveis.com.nexthomeimoveis.com`.

## Revisão de 20/10: ninguém assume o login de outro

- O gestor não manda link, reenvio nem troca de e-mail de **outro gestor**
  nem de **administrador da plataforma**.
- Conta com `last_sign_in_at`: link de senha **só no e-mail da pessoa**
  (sem `RESEND_API_KEY`, nem é gerado) e e-mail que não se troca. Link na
  tela só para quem nunca entrou. Sem ler o Auth, recusa.
- "Esqueci a senha" e "Sair e receber novo link" (em `/corretor/senha` com
  o link vencido) passam por `pedidoDeLinkDeSenha.ts`: 1/min e 5/h por
  e-mail, registro `link_de_senha_pedido` em `admin_eventos`. E-mail sem
  ficha com login não gera nada.
- O link carrega `&email=`; a tela do botão mostra a conta que ele abre, e o
  botão fecha a sessão se o token abrir outra. Falha passageira do
  `verifyOtp` (rede, 5xx, 429) não apaga o cookie do link.

## Relacionados

- [[plataforma-multi-grupo]]
- [[chave-de-servico-classificada-por-grupo]]
- [[dominio-proprio-nexthomeimoveis]]
