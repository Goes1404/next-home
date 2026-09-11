---
title: Credencial de terceiro se confere ANTES de virar env var
aliases: [meta:diag, token do Meta, ID da conta de anúncios]
tags: [infra, licao]
type: nota
status: growing
custou: medio
codigo:
  [
    scripts/metaDiagnostico.ts,
    src/lib/metaDiagnostico.ts,
    src/app/corretor/(painel)/admin/anuncios/page.tsx,
  ]
created: 2026-09-11
updated: 2026-09-11
fonte: incidente — a conexão do Meta Ads travou em 11/09/2026
summary: Token e ID de serviço externo eram julgados só depois de env var + redeploy, e o erro tinha o mesmo sintoma de "não configurado". O diagnóstico local responde antes de subir, e a lista de contas vem da própria Meta em vez de ser adivinhada.
---

# Credencial de terceiro se confere ANTES de virar env var

O caminho antigo de conectar o Meta Ads pedia duas coisas no escuro: **qual
dos números da Meta é o ID da conta de anúncios**, e **se o token na mão
serve**. As duas respostas só apareciam depois de gravar a variável na
Vercel e redeployar — e o sintoma de token errado era a
`meta_ads_metricas` continuar em zero, que é **indistinguível de "não
configurado"**.

Travou de verdade em 11/09/2026: um número de 16 dígitos na mão e nenhum
meio de dizer se era conta de anúncios, app ou página. Sondar a Graph API
sem token não resolve — ela devolve `access token required` para qualquer
ID, então o erro é o mesmo para o número certo e para o errado.

## O conserto é inverter a ordem, não guardar o token melhor

`npm run meta:diag -- <token>` julga a credencial no terminal, antes de
qualquer env var:

- `/debug_token` → tipo (usuário / Usuário do Sistema / página), app,
  validade e escopos;
- `/me/adaccounts` → **a lista de contas de anúncios que aquele token vê,
  com o nome de cada uma**. O ID deixa de ser adivinhado: vem da Meta.

**A lista mata a adivinhação melhor que qualquer instrução na tela.** Era
o passo 5 do passo a passo ("anote o ID da conta") — o passo que nenhum
texto consegue tornar fácil, porque o número não diz o que é.

## Os casos que enganam (todos com teste)

- **`expires_at: 0` significa "não vence"**, não epoch. É exatamente o
  token de Usuário do Sistema — tratar 0 como data faria o diagnóstico
  condenar o token definitivo.
- **`ads_read` pode vir só em `granular_scopes`.** A Meta migrou para
  escopo por conta; olhar só `scopes` reprova token bom, e o custo do erro
  é mandar alguém gerar outro que vai dar no mesmo.
- **Token de página é válido e não serve**: lê o webhook de leads, não lê
  investimento. Sem separar os dois, "válido" viraria "serve".
- **Token válido com ads_read e ZERO contas** é o Usuário do Sistema criado
  sem ativo atribuído. Diagnóstico próprio, não "token ruim".
- **Só dígitos não é token.** Colar o ID no lugar dele é o engano mais
  barato de pegar, e é o que aconteceu.

## Caminho rápido × caminho definitivo, e o preço de cada um

O Usuário do Sistema (`business.facebook.com/settings/system-users`) dá
token que **não vence**, e é o certo. Mas o menu só existe para quem é
**admin do Portfólio de Negócios** e com a conta de anúncios dentro dele —
e foi aí que a conexão parou.

O Graph API Explorer destrava hoje, com token de 60 dias. Isso cria um
caminho que **expira em silêncio**, que é o defeito recorrente deste
projeto ([[dado-gravado-e-nao-exibido-e-dado-perdido]]). Por isso a tela de
Anúncios ganhou a faixa de "o gasto não é atualizado há N dias": sem ela,
token vencido e campanha parada desenham o mesmo gráfico plano.

A faixa segue a régua de [[aviso-por-evolucao-nao-por-mensagem]] —
tolerância de 2 dias, porque o cron roda 1x/dia (teto do Hobby) e a Meta
ajusta gasto retroativamente. E "nunca sincronizou" é estado PRÓPRIO, não
"muito velho": configuração que nunca rodou pede outra ação que token
vencido no meio do caminho.

## A saída sai mascarada de propósito

O token é impresso como `EAAG12…<use --mostrar-token>`. Ele já está no
histórico do shell de quem rodou, então imprimir não acrescenta risco
local — mas a saída de um diagnóstico é exatamente o texto que se cola numa
conversa para pedir ajuda, e aí a credencial vaza. Revelar é ato explícito.

## Relacionadas

- [[dado-gravado-e-nao-exibido-e-dado-perdido]]
- [[aviso-por-evolucao-nao-por-mensagem]]
- [[env-var-nova-so-vale-depois-de-redeploy]]
