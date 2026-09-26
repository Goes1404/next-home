# Ligar as entradas de lead que já estão prontas

Duas portas de entrada estão construídas e nunca receberam nada em
produção: **o e-mail dos portais** (`inbound_logs` com 0 linhas) e **o Meta
Ads** (`meta_ads_metricas` com 0 linhas). Nenhuma das duas precisa de código:
falta configuração. Este guia é o passo a passo.

> **Segredos nunca passam pelo chat.** Toda chave e todo token abaixo vão
> direto para **Vercel → Settings → Environment Variables → Production**.
> Variável nova só vale **depois de um redeploy** (Deployments → ⋯ →
> Redeploy). Um 401 ou 503 persistente depois de configurar quase sempre é
> isso.

Depois que um lead entra por qualquer uma das duas portas, o resto já
funciona sozinho:
- a roleta escolhe o corretor, dando preferência a quem tem WhatsApp no ar;
- a assistente manda a primeira mensagem em até 5 minutos, dentro do
  horário comercial e com a cota anti-ban (`abrirConversasDePortal`);
- se ninguém falar com o lead em 30 minutos, o corretor recebe um aviso no
  WhatsApp.

---

## 1. E-mail dos portais (ZAP, VivaReal, OLX, Imovelweb)

**Como funciona:** o portal manda o e-mail do lead para um endereço de
recebimento. Esse serviço transforma o e-mail em uma chamada para
`/api/webhooks/email-lead`, e a IA extrai nome, telefone e imóvel. Um e-mail
com uma tabela de dezenas de leads também funciona.

### Qual serviço de recebimento usar

O endpoint lê os campos `from`, `to`, `subject`, `html` e `text` (ou
`From`, `To`, `Subject`, `HtmlBody`, `TextBody`, `MessageID`), em JSON ou
`multipart/form-data`. Por isso:

| Serviço | Serve? |
|---|---|
| **Postmark (Inbound)** | **Sim, recomendado.** Os campos JSON batem exatamente. |
| **SendGrid Inbound Parse** | Sim (`multipart` com `from`, `to`, `subject`, `text`, `html`). |
| Mailgun Routes | Não sem ajuste: ele manda `body-plain`/`sender`, que o endpoint não lê. |
| Cloudmailin (JSON) | Não sem ajuste: o remetente vem aninhado em `envelope`. |

### Passo a passo (Postmark)

1. **Crie o segredo** do webhook: uma sequência longa e aleatória (por
   exemplo, gere com `openssl rand -hex 32` no seu computador).
2. Na **Vercel**, crie `INBOUND_EMAIL_WEBHOOK_SECRET` com esse valor e
   faça o **redeploy**. Sem a variável, o endpoint recusa tudo com 503; é de
   propósito.
3. No **Postmark**, crie um servidor e abra **Inbound**. Ele dá um endereço
   do tipo `xxxx@inbound.postmarkapp.com`.
4. Em **Webhook URL** do Inbound, coloque:
   `https://next-home-drab.vercel.app/api/webhooks/email-lead?token=<o segredo>`
   (o segredo entra só nesse campo do painel do Postmark, nunca em
   conversa ou documento).
5. Em **cada portal**, cadastre esse endereço como o e-mail que recebe os
   leads. Se o portal só aceita o seu e-mail normal, crie no Gmail uma
   regra de **encaminhamento automático** para o endereço do Postmark,
   filtrando pelo remetente do portal.
6. **Teste**: mande para o endereço um e-mail com nome e telefone no corpo.
   Em até um minuto:
   - aparece uma linha em `inbound_logs` com status `sucesso`;
   - o lead aparece em Pessoas;
   - se o corretor tem WhatsApp conectado e é horário comercial, a primeira
     mensagem sai em até 5 minutos.

### Se não entrar

| Sintoma | Causa provável |
|---|---|
| 503 no log do Postmark | Variável ausente ou sem redeploy. |
| 401 | Token da URL diferente do da Vercel. |
| 200 com `ignorado` em `inbound_logs` | O e-mail não tinha telefone que a IA reconhecesse. Confira o texto do portal. |
| Nada em `inbound_logs` | O e-mail não chegou ao Postmark. Confira o encaminhamento. |

---

## 2. Meta Ads (Facebook e Instagram)

São duas coisas independentes, e dá para ligar uma sem a outra.

### 2a. Investimento e custo por lead (`/corretor/admin/anuncios`)

Precisa de duas variáveis:
- `META_ADS_ACCOUNT_ID`: o número da conta de anúncios, só dígitos;
- `META_ADS_TOKEN`: um token com permissão `ads_read`. O ideal é o de
  **Usuário do Sistema**, que não vence. Se o menu não aparecer, você não é
  admin do portfólio. Enquanto isso, o Graph API Explorer dá um token de
  60 dias.

**Não adivinhe o ID da conta.** Antes de gravar na Vercel, rode no seu
computador, com o token no terminal (e não no chat):

```
npm run meta:diag -- <token>
```

Ele diz o tipo e a validade do token, se tem `ads_read`, e **lista as
contas com nome**, já com o `META_ADS_ACCOUNT_ID` formatado. A saída
mascara o token.

Depois de gravar as duas variáveis e fazer o redeploy, o cron diário
(`/api/cron/meta-ads`) enche `meta_ads_metricas`. Na tela de Anúncios há o
botão "Sincronizar agora". A faixa "o gasto não é atualizado há N dias"
avisa quando o token vence.

### 2b. Anúncios que abrem o WhatsApp (o formato que vocês usam)

Não precisa de nenhuma variável. O anúncio aponta para o porteiro:

```
https://next-home-drab.vercel.app/wa/<slug-do-imovel>?mc={{campaign.id}}&ma={{ad.id}}
```

- A Meta troca `{{campaign.id}}` e `{{ad.id}}` no clique. O ID fica gravado
  e liga o lead à campanha no relatório de Anúncios.
- O `slug` é o do cadastro do imóvel, e os apelidos também funcionam.
- O link sorteia entre os corretores com WhatsApp no ar, mandando para o
  fim da fila quem recebeu o último clique daquele imóvel.

### 2c. Formulário de Lead Ads (opcional)

Só se um dia usarem formulário da própria Meta. Precisa de:
- `META_APP_SECRET`;
- `META_WEBHOOK_VERIFY_TOKEN`;
- `META_PAGE_ACCESS_TOKEN`;
- o app da Meta assinando o campo `leadgen` da página, com a URL
  `https://next-home-drab.vercel.app/api/webhooks/meta`.

---

## 3. Antes de ligar: a equipe precisa estar pronta

Lead que entra para um corretor sem WhatsApp conectado não é atendido pela
assistente. Confira em **Administração → Visão geral → "Equipe pronta para
atender"** quem ainda não conectou o número, não tem agenda ou nunca
entrou. Cada corretor vê o que falta no próprio Início.
