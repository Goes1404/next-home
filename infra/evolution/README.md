# Subir a Evolution API

Tudo que depende de código já está pronto neste diretório. O que sobra é o
que exige **a sua conta e o seu cartão** — servidor e domínio. São ~15
minutos e ~R$ 30/mês.

## O que você precisa decidir antes

**Um servidor.** A Evolution mantém a sessão do WhatsApp aberta 24h; não
roda em Vercel (funções morrem entre requisições) nem em notebook (desligou,
caiu a sessão de todos os corretores). Opções equivalentes:

| Provedor | Plano | Preço |
|---|---|---|
| Hetzner | CX22 (2 vCPU, 4 GB) | ~€4/mês |
| DigitalOcean | Basic 2 GB | ~US$ 12/mês |
| Contabo / Hostinger VPS | qualquer 2 GB | ~R$ 30/mês |

2 GB de RAM aguentam com folga a equipe de vocês.

**Um subdomínio.** Ex.: `evo.nexthomeimobiliaria.com.br`. No painel de DNS,
crie um registro **A** apontando para o IP do servidor. Faça isso primeiro:
o certificado HTTPS só é emitido depois que o DNS propaga.

## Passo a passo no servidor

Conecte via SSH (`ssh root@SEU_IP`) e rode:

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Traga estes arquivos (do repositório do site)
mkdir -p /opt/evolution && cd /opt/evolution
# copie docker-compose.yml, Caddyfile e .env.example para cá
# (scp, git clone ou copiar e colar mesmo)

# 3. Configure
cp .env.example .env
nano .env          # preencha os três valores

# 4. Suba
docker compose up -d

# 5. Confira (deve responder JSON, não erro de certificado)
curl https://SEU_DOMINIO
```

Se o passo 5 falhar com erro de TLS, o DNS ainda não propagou — espere uns
minutos e rode `docker compose restart caddy`.

## Depois: ligar o site à Evolution

Com o Vercel CLI autenticado (`vercel login`), no diretório do projeto:

```bash
vercel link                     # uma vez, para associar o diretório ao projeto

vercel env add WHATSAPP_API_URL production
# cole: https://SEU_DOMINIO

vercel env add WHATSAPP_API_KEY production
# cole: o mesmo AUTHENTICATION_API_KEY do .env

vercel env add WHATSAPP_WEBHOOK_URL production
# cole: https://SEU_SITE/api/webhooks/whatsapp

vercel env add WHATSAPP_WEBHOOK_SECRET production
# cole: o segredo que você guardou

vercel env add SUPABASE_SECRET_KEY production
# cole: a service_role key do Supabase (Settings > API)

vercel env add GEMINI_API_KEY production
# cole: a chave do Google AI Studio (aistudio.google.com/apikey)

vercel --prod                   # redeploy para as variáveis valerem
```

Dá para fazer o mesmo pelo painel: *Settings → Environment Variables*.
Variável nova só passa a valer no **próximo build** — o redeploy não é
opcional.

## Conferir que fechou o ciclo

1. Um corretor entra em `/corretor/whatsapp` e clica em **Conectar via QR
   Code**. O QR que aparece agora é real (vem da Evolution).
2. Ele lê com o celular: WhatsApp → Aparelhos conectados.
3. De outro telefone, mande mensagem para o número dele.

Deve acontecer: a IA responde no WhatsApp de quem mandou, a conversa aparece
em `whatsapp_conversas`, e se o lead pontuar 75+ o corretor recebe o alerta
privado.

Se não responder, o retorno do webhook diz o motivo em
`respostaMotivoFalha` — não falha em silêncio.

## Manutenção

```bash
docker compose logs -f evolution     # ver o que está acontecendo
docker compose pull && docker compose up -d   # atualizar
docker compose down                  # parar (as sessões sobrevivem, estão em volume)
```

**Nunca** rode `docker compose down -v`: o `-v` apaga os volumes, e com eles
as sessões de todos os corretores.
