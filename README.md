This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Webhook do Meta Lead Ads

Leads de anúncio do Instagram/Facebook chegam via
`POST /api/webhooks/meta`. Passo a passo de configuração:

1. **Criar o app**: developers.facebook.com → Meus Apps → Criar App → tipo
   "Empresa". Anotar o App ID e, em Configurações → Básico, o App Secret
   (`META_APP_SECRET`).
2. **Adicionar o produto Webhooks** ao app.
3. **Adicionar o produto Lead Ads** (ou "Página" com permissão
   `leads_retrieval`) — necessário para a Graph API liberar
   `GET /{leadgen_id}`.
4. **Gerar o Page Access Token de longa duração**:
   - Graph API Explorer → selecionar o app → gerar token de usuário com
     `pages_show_list`, `pages_manage_ads`, `leads_retrieval`,
     `pages_read_engagement`.
   - Trocar por um token de usuário de longa duração
     (`GET /oauth/access_token?grant_type=fb_exchange_token&...`).
   - Trocar pelo token da **página** (`GET /me/accounts` com o token de
     usuário) — esse é o `META_PAGE_ACCESS_TOKEN`.
5. **Configurar o webhook**: Callback URL =
   `https://<domínio>/api/webhooks/meta`, Verify Token = o mesmo valor de
   `META_WEBHOOK_VERIFY_TOKEN`.
6. **Assinar o campo `leadgen`** para a Página específica (não basta
   assinar no nível do app).
7. **Testar**: [Lead Ads Testing
   Tool](https://developers.facebook.com/tools/lead-ads-testing) →
   selecionar a página e um formulário de teste → enviar lead de teste →
   conferir em `/corretor/leads`.
8. Preencher `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`,
   `META_PAGE_ACCESS_TOKEN` em produção (Vercel) e em `.env.local`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
