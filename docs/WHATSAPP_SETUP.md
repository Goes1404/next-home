# Ligar o Assistente de WhatsApp — passo a passo

O código já está pronto e no ar. Falta a infraestrutura. Este guia é o
caminho do zero até o primeiro corretor conectado.

## Por que Evolution API (e não a API da Meta)

São coisas diferentes, e a confusão custa caro:

| | API oficial (Meta) | **Evolution API** |
|---|---|---|
| Verificação de empresa | Exigida (semanas) | Não |
| Número do corretor | Dedicado, sai do app dele | **Continua o dele, no app dele** |
| Templates aprovados | Sim | Não |
| Custo por mensagem | Sim | Não |

A Evolution funciona como o **WhatsApp Web**: o corretor lê um QR Code e o
número segue sendo o dele. É o que viabiliza um número por corretor.

**O risco, dito com todas as letras:** é uma ponte não-oficial. A Meta pode
banir um número que se comporte como robô. Está em jogo o número pessoal de
trabalho do corretor. Por isso a fila de campanhas espaça os disparos entre
35 e 75 segundos e varia o texto de cada mensagem — e por isso vale começar
com **um corretor voluntário**, não com a equipe inteira.

## 1. Subir a Evolution

O stack pronto está em [`infra/evolution/`](../infra/evolution/README.md):
`docker-compose.yml` com Postgres para as sessões e Caddy resolvendo o
HTTPS sozinho. No servidor é `docker compose up -d`.

Siga o [README de lá](../infra/evolution/README.md) — ele tem o passo a
passo completo, incluindo a escolha do servidor e do subdomínio.

## 2. Configurar as variáveis na Vercel

Em *Settings → Environment Variables* do projeto:

| Variável | Valor |
|---|---|
| `WHATSAPP_API_URL` | `https://evo.suaempresa.com.br` |
| `WHATSAPP_API_KEY` | a mesma `AUTHENTICATION_API_KEY` do passo 1 |
| `WHATSAPP_WEBHOOK_URL` | `https://<seu-site>/api/webhooks/whatsapp` |
| `WHATSAPP_WEBHOOK_SECRET` | uma chave longa e aleatória, inventada por você |
| `SUPABASE_SECRET_KEY` | a chave de serviço do Supabase |
| `GEMINI_API_KEY` | chave do Google AI Studio |

Redeploy depois de salvar — variável nova só vale no próximo build.

Sem `WHATSAPP_API_URL`/`WHATSAPP_API_KEY` nada é enviado, e o painel diz
isso na tela. Sem `WHATSAPP_WEBHOOK_SECRET`, a rota **recusa** todo POST em
produção (cada chamada custa duas requisições ao Gemini — não pode ficar
aberta).

## 3. Conectar o primeiro corretor

1. O corretor entra em `/corretor/whatsapp`.
2. Clica em **Conectar via QR Code**. O sistema cria a instância dele na
   Evolution (nome `nexthome-<slug>`), já apontando o webhook de volta pra
   cá, e mostra o QR real.
3. No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.
4. Em **Testar Minha IA ao Vivo**, conversa com a assistente como se fosse
   cliente. Isso chama o Gemini de verdade sobre o catálogo real — é o
   lugar de ajustar tom de voz antes de qualquer cliente falar com ela.

## 4. Conferir que fechou o ciclo

Mande uma mensagem de outro celular para o número conectado. Deve acontecer:

- a resposta da IA chega no WhatsApp de quem mandou;
- a conversa aparece em `whatsapp_conversas` e as falas em
  `whatsapp_mensagens`;
- se o lead pontuar 75+ ou pedir visita, o corretor recebe o alerta privado;
- se o corretor responder pelo celular dele, a IA silencia naquela conversa
  por 24h.

Se a resposta não chegar, o retorno do webhook diz o motivo em
`respostaMotivoFalha` — não falha em silêncio.

## Regras anti-ban (o que o sistema impede sozinho)

A política vive em `src/lib/whatsapp/antiBan.ts` — pura e coberta por 21
testes, para poder ser discutida e ajustada sem subir nada.

**1. Responder ≠ disparar.** Quem escreveu para o corretor recebe resposta
sempre, sem cota e sem janela de horário — foi o cliente que puxou
conversa, e deixá-lo no vácuo é pior para o número. Só o disparo frio de
campanha consome cota.

**2. Aquecimento do número.** A cota diária de campanha cresce com a idade
da conexão:

| Tempo conectado | Disparos/dia |
|---|---|
| 0–2 dias | 15 |
| 3–6 dias | 30 |
| 7–13 dias | 60 |
| 14–29 dias | 100 |
| 30+ dias | 150 |

Números propositalmente conservadores: o gargalo de vocês é o volume real
de leads, que é baixo. Não há nada a ganhar chegando perto do limite, e há
um número de trabalho a perder.

**3. Janela de horário.** Campanha só sai das 9h às 20h59, de segunda a
sábado, no fuso de São Paulo. Fila longa iniciada no fim da tarde é
empurrada para a próxima janela em vez de atravessar a madrugada.

**4. Ritmo humano.** 35 a 75 segundos entre disparos, sorteados a cada
mensagem — e a fila garante ordem crescente, sem duas mensagens caindo no
mesmo segundo.

**5. Texto sempre diferente.** Cada mensagem é reescrita pela IA. Quando
isso não roda (sem `GEMINI_API_KEY`), o item fica marcado como
`personalizadoPorIA: false` — a proteção não some em silêncio.

**6. Disjuntor automático.** Três falhas de envio seguidas costumam
significar número já restrito pelo WhatsApp. Insistir a partir daí é o que
transforma restrição em banimento — então o sistema bloqueia sozinho os
disparos daquele número por 12 horas.

A cota é debitada por uma função no banco (`consumir_cota_campanha`), não
na aplicação: dois disparos simultâneos leriam o mesmo contador e ambos se
achariam dentro do limite, furando a cota justamente no pico.

## Modo de operação recomendado

Comece com o bot em **Noturno & Fim de Semana**: ele cobre o horário em que
ninguém responderia mesmo, e o corretor mantém o atendimento humano no
horário comercial. É o menor risco possível para o número enquanto vocês
ganham confiança no tom de voz da assistente.
