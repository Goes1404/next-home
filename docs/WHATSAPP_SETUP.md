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

Precisa de um servidor com Docker e um domínio com HTTPS (uma VPS básica
resolve). No servidor:

```bash
docker run -d \
  --name evolution \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY='troque-por-uma-chave-longa-e-aleatoria' \
  -v evolution_instances:/evolution/instances \
  atendai/evolution-api:v2.1.1
```

Ponha um proxy reverso (Caddy, Nginx) com TLS na frente — o WhatsApp e o
nosso webhook falam HTTPS. Anote a URL final, ex.:
`https://evo.suaempresa.com.br`.

> O volume (`-v`) não é opcional: sem ele, um restart do contêiner derruba
> as sessões e todos os corretores precisam ler o QR Code de novo.

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

## Modo de operação recomendado

Comece com o bot em **Noturno & Fim de Semana**: ele cobre o horário em que
ninguém responderia mesmo, e o corretor mantém o atendimento humano no
horário comercial. É o menor risco possível para o número enquanto vocês
ganham confiança no tom de voz da assistente.
