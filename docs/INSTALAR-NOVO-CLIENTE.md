# Instalar a plataforma para outra imobiliária

A Next Home é o espelho da versão geral: **cada cliente ganha um projeto
Vercel e um banco Supabase próprios** (decisão de 26/09/2026). Nada é
compartilhado entre clientes, então nenhum dado de um vaza para o outro por
erro de filtro.

> **Segredos nunca passam pelo chat.** Toda chave vai direto para Vercel →
> Settings → Environment Variables → Production, e variável nova só vale
> depois de um redeploy.

## 1. Banco (Supabase)

1. Crie um projeto novo, **plano pago** (o gratuito limita arquivo a 50 MB e
   pausa por inatividade).
2. Aplique **todas** as migrations de `supabase/migrations/` em ordem. Não
   confie em `list_migrations` para saber o que falta: confira os objetos em
   `information_schema` (ver MEMORIA).
3. Rode as funções de agendamento com a URL nova e o `CRON_SECRET` novo:
   `configurar_disparo_automatico(...)` e `configurar_followups_automaticos(...)`.
4. Crie o primeiro gestor pelo Auth e marque `corretores.papel = 'gestor'`.

## 2. Aplicação (Vercel)

Plano **Pro** (o Hobby não permite uso comercial). Variáveis:

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | banco |
| `NEXT_PUBLIC_SITE_URL` | domínio do cliente |
| `NEXT_PUBLIC_MARCA` | a marca (gere em **Administração → Marca**) |
| `CRON_SECRET` | crons |
| `OPENAI_API_KEY` | a IA (texto e transcrição de áudio) |
| `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_WEBHOOK_URL`, `WHATSAPP_WEBHOOK_SECRET` | Evolution |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | e-mail dos portais (opcional) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Gmail do corretor (opcional) |
| `META_ADS_ACCOUNT_ID`, `META_ADS_TOKEN` | Meta Ads (opcional) |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | e-mail (opcional) |

## 3. A marca

- **Texto** (nome, CRECI, endereço, WhatsApp, redes, regiões, nome da
  assistente): `NEXT_PUBLIC_MARCA`, gerada na tela de Marca. Campo que ficar
  de fora usa o padrão da Next Home, e a tela avisa quais são.
- **Imagens**: logotipo e imagem de compartilhamento ficam no bucket
  `empreendimentos/marca/` (`logo-original.png`, `og-image.jpg`) e em
  `public/marca/`. Troque os arquivos mantendo os nomes.
- **Cores**: a escala `brand` e `azure` em `src/app/globals.css`. Depois de
  trocar, rode `npm run paleta` — ela reprova contraste abaixo de AA.

## 4. Depois de subir

- `/api/versao` responde o commit.
- Siga `docs/LIGAR-ENTRADAS-DE-LEADS.md` para as entradas de lead.
- Cada corretor conecta o WhatsApp e segue os primeiros passos do Início.
