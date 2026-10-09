---
title: Identidade da marca para o Google
aliases: [SEO da marca, dados estruturados, redirecionamento do vercel.app, site antigo como concorrente, perguntas frequentes do imóvel]
tags: [front, seo, decisao]
type: decisao
status: ativo
custou: medio
codigo: ["src/lib/site.ts", "src/lib/dadosEstruturados.ts", "src/lib/seoDoImovel.ts", "src/components/empreendimento/PerguntasFrequentes.tsx", "src/app/(institucional)/page.tsx", "src/app/(vitrine)/empreendimentos/[slug]/page.tsx", "src/app/(institucional)/regioes/[slug]/page.tsx", "next.config.ts", "src/app/favicon.ico", "src/app/icon.png", "src/app/apple-icon.png", "scripts/marca/gerarIcones.mjs"]
summary: A home passou a declarar a organização (com os nomes pelos quais procuram a marca) e o WebSite com busca interna; imóvel e região ganharam trilha (BreadcrumbList); o endereço da Vercel redireciona as páginas públicas para o domínio. O que mais pesa continua do lado do dono: o domínio antigo ainda não aponta para cá.
updated: 2026-10-09
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

## O site antigo ficou, e virou concorrente da própria marca (07/10, tarde)

Decisão do dono: `nexthomeimobiliaria.com.br` continua no ar porque uma venda
saiu por ele. Então não há 301, e os dois sites disputam as mesmas buscas.
Medido o "concorrente": 65 páginas, 2,5 s para responder, sem `viewport`
(celular), acentos quebrados (latin1), sem dados estruturados, títulos por
BAIRRO ("apartamento lançamentos jardim tupanci barueri") — e os mesmos
empreendimentos que os nossos.

O que entrou para ganhar dele onde ele é fraco:

- **Título do imóvel com tipo e bairro quando cabem** (`tituloDoImovel`):
  "Joy — Apartamentos em Jardim Tupanci, Barueri" → "Joy Barueri — Jardim
  Tupanci, Barueri" → "nome — cidade". Medido nos 39: todos ≤ 48 caracteres,
  29 ganharam o bairro, 5 ganharam o tipo. A regra de 27/08 ("cidade, não
  bairro") valia porque o bairro NÃO cabia no caso medido; agora o bairro
  entra quando cabe. **`${#t}` do bash conta BYTES em locale C**: "—" vale 3,
  e a primeira contagem acusou 6 títulos acima de 48 que tinham 47–48.
- **Perguntas frequentes por imóvel**, montadas do cadastro e só do que ele
  tem (dormitórios/metragem/suítes/vagas, onde fica, estágio e entrega, valor,
  lazer, construtora, como visitar) — à vista na página (`<details>`) e no
  `FAQPage`, com o MESMO texto. Sem data de entrega a resposta diz que o
  corretor confirma; nunca inventa. O endereço cadastrado costuma já trazer o
  bairro: `ondeFica` não repete o que ele contém (a captura pegou "Jardim
  Tupanci, Jardim Tupanci").
- A busca do Google que tenho aqui é só dos EUA e não mostra a SERP
  brasileira: o ranking real se acompanha no Search Console, não daqui.

O que continua do lado do dono e pesa mais: Perfil da Empresa no Google e
as bios das redes apontando para o domínio novo; um link do site antigo para
o novo ("lançamentos 2026") passa autoridade sem tirar o antigo do ar.

## O ícone da aba era o do Next.js (09/10)

O `src/app/favicon.ico` era o padrão do `create-next-app` (md5 `c30c7d42…`):
na aba do navegador, no resultado do Google e na tela inicial do celular
aparecia o triângulo do Next, não a marca.

- Os três arquivos saem de `node scripts/marca/gerarIcones.mjs`, a partir do
  símbolo recortado da logo (`scripts/marca/simbolo.png`): `favicon.ico`
  (16, 32 e 48 px), `icon.png` (192 px, múltiplo de 48 como o Google pede) e
  `apple-icon.png` (180 px, opaco: o iPhone pinta de preto o transparente).
- **Só o símbolo, sem o nome**: em 16 px o texto não se lê.
- **Fundo branco de cantos arredondados**: a casa da logo é desenhada pelo
  espaço vazio. Com fundo transparente, na aba escura do navegador a casa some.
- O Next lê esses nomes sozinho e escreve as tags no `<head>`; o `proxy.ts`
  não toca em caminho com ponto.
- O resultado do Google demora a trocar o ícone: ele é lido de novo quando o
  robô volta à página.
- O atalho da tela inicial não troca: ele guarda o ícone de quando foi criado.
  O manifesto com ícone grande veio depois, ver
  [[atalho-da-tela-inicial-guarda-o-icone-antigo]].

## O escritório mudou para o Office Bethaville (09/10)

O endereço do site passou a ser **Av. Trindade, 254 — Office Bethaville,
Bethaville I, Barueri/SP, CEP 06404-326** (era Calçada Antares, 264,
Alphaville, Santana de Parnaíba).

- Mora num lugar só: `site.endereco` em `src/lib/site.ts`. Rodapé, Contato,
  Sobre, mapa da sede, `geo.*` do `<head>` e o `RealEstateAgent` leem dali.
  As duas frases que diziam "imobiliária de Alphaville" e "atendimento
  presencial em Alphaville" passaram a ler a cidade do endereço.
- **A coordenada é estimada pelo número.** O OpenStreetMap não tem o prédio,
  e o pino do anúncio do Office Bethaville (Lopes) cai na avenida vizinha
  (Av. Presidente Tancredo de Almeida, onde a Av. Trindade começa). A
  numeração anda ~1 m por número: os prédios 344 e 522 do mesmo lado estão a
  171 m um do outro, então o 254 fica ~90 m antes do 344. O mapa da sede já
  diz "aproximado".
- **O Perfil da Empresa no Google precisa do endereço novo**: endereço
  diferente entre o site e o perfil enfraquece a busca local
  (`docs/TAREFAS-FUTURAS.md`).

