---
title: A Next Home é o espelho da versão geral
tags: [infra, decisao]
type: nota
status: stable
custou: baixo
codigo: src/lib/site.ts
created: 2026-09-26
updated: 2026-09-26
summary: Decisão de produto de 26/09 — terminar o CRM da Next Home completo e, depois, derivar dele uma versão geral para vender, com funcionalidades limitadas e uma instalação (banco + projeto Vercel) por imobiliária. Nada de multi-empresa num banco só.
---

# A Next Home é o espelho da versão geral

Decisão do dono do produto (26/09/2026):

- **Esta instalação é a completa ("aberta")** e é a referência. Primeiro
  termina-se ela.
- **A versão para vender será derivada dela, com funcionalidades
  limitadas**, e roda como **uma instalação por cliente** (banco próprio,
  projeto Vercel próprio, variáveis próprias). Multi-empresa num banco só
  (coluna de empresa em toda tabela + RLS) foi considerado e descartado.
- **Consequência para integrações de terceiro (Meta Ads, WhatsApp, OpenAI):**
  credencial por variável de ambiente continua valendo — cada cliente tem as
  dele na própria Vercel. O "Conectar com Facebook" por OAuth e a revisão do
  app na Meta só seriam necessários no modelo multi-empresa.

O que foi levantado como risco, para quando chegar a hora (não feito agora,
por decisão):

- Preferir **um repositório implantado várias vezes** a copiar o código —
  cópia faz todo conserto ter de ser repetido em cada cliente. Se a versão
  geral precisar de outro código (funcionalidades cortadas), o corte de
  funcionalidade pode ser por configuração no mesmo repositório.
- **Histórico de migrations confiável** antes do segundo banco: hoje
  `list_migrations` está dessincronizado e já apareceu função aplicada direto
  no banco sem migration (`sortear_corretor_whatsapp(preferido)`, 26/09).
- **O que está fixo como "Next Home" no código** (nome, CRECI, logo, domínio
  `next-home-drab.vercel.app`, textos da assistente) precisa virar
  configuração.
- **Planos**: Vercel Hobby não permite uso comercial; Supabase gratuito tem
  poucos projetos por organização.

Ver [[link-de-anuncio-e-rodizio-aleatorio]] para o estado do porteiro de
anúncios que a versão geral herdará.
