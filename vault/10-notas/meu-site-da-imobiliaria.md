---
title: Meu site — o que cada imobiliária edita no próprio site
tags: [front, painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0209_site_do_grupo.sql
  - src/lib/sites/siteEditavel.ts
  - src/lib/sites/siteDoGrupo.ts
  - src/lib/sites/marca.ts
  - src/lib/sites/resolver.ts
  - src/lib/sites/tags.ts
  - src/lib/sites/hostsDaPlataforma.ts
  - src/app/corretor/(painel)/admin/site/acoes.ts
  - src/app/corretor/(painel)/admin/site/page.tsx
  - src/app/plataforma/enderecosAcoes.ts
  - src/app/plataforma/grupos/[id]/EnderecosDoGrupo.tsx
  - src/app/s/[site]/layout.tsx
  - src/components/ui/LogoDaMarca.tsx
  - src/components/layout/Footer.tsx
summary: O gestor edita cor, logo, capa, título, frase, "Sobre" e contatos do site do próprio grupo; o site lê isso para grupos diferentes do 1 (campo vazio cai no padrão) e a Next Home continua vindo de site.ts, travada por teste. A plataforma liga os endereços.
created: 2026-10-21
updated: 2026-10-21
---

# Meu site

Plano: `docs/superpowers/plans/2026-10-21-site-editavel.md`. Migration 0209.

## Decisões

- **Colunas `site_*` em `grupos`, não tabela 1:1.** Conjunto pequeno e fixo,
  lido junto com nome/logo/CRECI; uma tabela a mais pediria RLS, carimbo e
  grants sem ganho. As colunas NÃO têm grant nenhum para o logado (nem
  SELECT): só a chave de serviço lê e grava, depois da guarda. Os CHECKs da
  0209 repetem as validações de `siteEditavel.ts` (hex minúsculo, https, UF,
  tamanhos).
- **Grupo 1 intocado.** `marcaDoGrupo` ignora `personalizacao` no grupo 1 e
  devolve os campos novos nulos; o resolvedor nem lê o banco para ele. Testes:
  `marca.test.ts` (JSON idêntico), `resolver.test.ts` (não consulta) e
  `Footer.meuSite.test.tsx` (HTML idêntico). A tela "Meu site" do grupo 1 só
  explica, e as actions recusam o grupo 1.
- **Leitura pública pelo servidor**: `resolverSite` → `consultarPersonalizacao`
  (`unstable_cache`, tag `site-do-grupo`, 300 s). Erro de leitura LANÇA (a
  página sai 500 e o cache segue servindo o anterior); coluna inexistente
  (42703, antes da 0209) vale como em branco. Salvar chama
  `revalidateTag(TAG_SITE_DO_GRUPO)` + `revalidarSitePublico()` +
  `revalidarCatalogo()` (a guarda `cacheDoCatalogo.test.ts` cobra).
- **Cor**: só reaponta a família `--color-acento*` e `--color-sobre-cor` num
  `<div className="contents">` no layout `s/[site]` (como o login faz). O
  texto sobre a cor é branco ou preto, o de maior contraste WCAG. Sem cor (e
  sempre na Next Home) o envoltório nem existe.
- **Endereço do escritório sem lat/lng**: `MarcaDoSite.endereco.lat/lng` ficou
  opcional; sem coordenada não há mapa, `geo` do JSON-LD nem `geo.position`.
- **Plataforma liga o endereço** (`/plataforma/grupos/[id]` → Site):
  `ligarEnderecoDoSite`/`removerEnderecoDoSite`, host reduzido a DNS válido,
  recusa hosts da Next Home, do painel e do domínio da plataforma, traduz a
  PK (23505), um principal por grupo (solta o antigo antes). O domínio também
  precisa entrar em Vercel → Settings → Domains.
- Destaques: nada novo, a tela "Ordem no site" já é por grupo (RLS); "Meu site"
  só linka.

## Armadilhas

- Arquivo `"use server"` só exporta funções assíncronas: constante exportada
  quebra o build.
- O menu mobile é portal: fica fora do `div` com as variáveis de cor.
- `semGrupoDoSiteNoPainel.test.ts` proíbe o painel de importar `sites/resolver`:
  os helpers de host moram em `sites/hostsDaPlataforma.ts`.
- Antes do deploy: aplicar a 0209 (aditiva) e conferir um grupo com e sem
  campos preenchidos.
