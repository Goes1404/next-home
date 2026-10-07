---
title: Identidade da marca para o Google
aliases: [SEO da marca, dados estruturados, redirecionamento do vercel.app]
tags: [front, seo, decisao]
type: decisao
status: ativo
custou: medio
codigo: ["src/lib/dadosEstruturados.ts", "src/app/(institucional)/page.tsx", "src/app/(vitrine)/empreendimentos/[slug]/page.tsx", "src/app/(institucional)/regioes/[slug]/page.tsx", "next.config.ts"]
summary: A home passou a declarar a organização (com os nomes pelos quais procuram a marca) e o WebSite com busca interna; imóvel e região ganharam trilha (BreadcrumbList); o endereço da Vercel redireciona as páginas públicas para o domínio. O que mais pesa continua do lado do dono: o domínio antigo ainda não aponta para cá.
updated: 2026-10-07
---

# Identidade da marca para o Google

Pedido de 07/10/2026: "melhorar o rank quando pesquisam imóveis, a Next ou
algo do tipo". Medido antes: títulos, canonical, sitemap (58 URLs, todas 200)
e dados estruturados já estavam certos desde a reforma de SEO de 27/08; o
domínio `www.nexthomeimoveis.com` está no ar e `NEXT_PUBLIC_SITE_URL` já
aponta para ele.

## O que entrou

- **`dadosEstruturados.ts`** (puro, com teste): `RealEstateAgent` com `@id`
  fixo, `alternateName` ("Next Home", "Next Home Imóveis", "Next Home
  Imobiliária"), `logo` e `image`; `WebSite` com `name = site.nome` (o mesmo
  sufixo dos títulos — é assim que o Google escolhe o nome do site nos
  resultados) e `SearchAction` apontando para `?busca=`, que é o parâmetro que
  a listagem LÊ. O `seller` da oferta do imóvel passou a referenciar o `@id`
  da organização em vez de descrever outra.
- **BreadcrumbList** no imóvel (Início › Empreendimentos › nome) e na região
  (a mesma trilha que a página mostra).
- **A home estava sem `og:image`**: o `openGraph` da página substitui o do
  layout, não mescla. `OG_IMAGEM` virou constante única.
- **`next-home-drab.vercel.app` → domínio, 308**, só nas páginas públicas.
  Ficam de fora `/api` (webhook, crons e `/api/versao` chamam este host pelo
  nome), `/corretor` (sessão é por domínio) e arquivos com extensão. Só vale
  com `NEXT_PUBLIC_SITE_URL` fora de `vercel.app`. Provado em `next start`
  com o cabeçalho `Host` antes de subir.

## O que NÃO dá para fazer daqui, e pesa mais que tudo acima

- **`nexthomeimobiliaria.com.br` ainda serve o site legado** (Apache da
  Migmidia), com o título "Next Home Negócios Imobiliários". É o domínio que
  o Google já associa à marca há anos. Um 301 dele para
  `www.nexthomeimoveis.com` transfere esse histórico; sem isso, o domínio
  novo começa do zero. É ajuste no registro/hospedagem do domínio antigo.
- **Search Console** do domínio novo (verificação por TXT no DNS da
  Hostinger) com o sitemap enviado, e **Perfil da Empresa no Google** com o
  site novo. Sem os dois, o Google demora a descobrir e não liga a ficha
  local ao site.

Liga com a seção de SEO da MEMORIA (27/08) e com [[dominio-proprio-nexthomeimoveis]].
