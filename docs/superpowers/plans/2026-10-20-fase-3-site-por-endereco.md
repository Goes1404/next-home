# Fase 3 enxuta — o site de cada grupo pelo endereço (plano)

Escopo combinado com o dono (spec `2026-10-18-plataforma-multi-grupo-design.md`,
§6, §13, §18 "Fase 3", §19 pergunta 3, §20): o site público deixa de ser fixo
no grupo 1 (`grupoDoSite()`) e passa a sair do `Host` da requisição. Fora do
escopo, para depois: portfólio editável (marca visual do grupo), redirecionar o
endereço gratuito para o próprio, regiões/mapa por grupo, páginas por token
conferindo o Host, slug do corretor por grupo, privacidade por grupo.

## Decisão de arquitetura: reescrita para um segmento por site

O `proxy.ts` NÃO consulta o banco (a documentação do Next desaconselha e a F2
mediu o custo de rede no proxy). Ele só reescreve `/<caminho>` para
`/s/<host>/<caminho>`. As páginas públicas passam a morar em
`src/app/s/[site]/(institucional|vitrine)/…`; o layout de `[site]` resolve o
host para o grupo (cache de dados por host) e responde 404 neutro quando o
host não é de nenhum grupo.

Por quê, e não `headers()` em cada página: com `headers()` toda página pública
vira dinâmica (a regressão que a F2b desfez, medida em 12/10: 11 de 14 páginas
saindo do cache da Vercel). Com o host no caminho, o cache de rota (ISR) já é
por site — a lacuna L56 se resolve por construção —, as páginas continuam
estáticas e o host canônico da Next Home continua prerenderizado no build
(`generateStaticParams` do segmento). A medida (antes e depois, `next build` e
TTFB local) fica no fim deste plano e na nota do vault.

## Arquivos

- `supabase/migrations/0201_enderecos_do_site.sql`: tabela
  `enderecos_do_site` (host, grupo, tipo próprio/gratuito, principal), com
  grupo_id, carimbo `_00_grupo`, `isolamento_por_grupo`, revoke de anon e
  authenticated; função `site_do_endereco(host, dominio_da_plataforma)`
  (security definer, só devolve o grupo do host pedido; grupo encerrado não
  tem site); semente com os três endereços da Next Home.
- `src/lib/sites/endereco.ts` (puro): normalizar host, endereço gratuito pelo
  slug, hosts de desenvolvimento, hosts da Next Home.
- `src/lib/sites/marca.ts` (puro): marca do site — a da Next Home no grupo 1,
  uma marca neutra (só o nome do grupo, sem telefone, CRECI, endereço nem redes)
  nos outros.
- `src/lib/sites/resolver.ts` (server-only): host → `SiteDoGrupo`, com
  `unstable_cache` por host e etiqueta `enderecos-do-site`.
- `src/lib/sites/pagina.ts`: `siteDaPagina(params)` (páginas sob `[site]`) e
  `siteDaRequisicao(request)` (rotas `/wa`, `/api/leads`,
  `/api/clique-whatsapp`, sitemap, robots).
- `src/proxy.ts`: reescrita para `/s/<host>`, fora `/corretor`, `/plataforma`,
  `/auth`, `/wa`.
- `src/app/s/[site]/layout.tsx`: resolve, `generateMetadata` por site
  (metadataBase = host principal, título e Open Graph com o nome do grupo),
  contexto da marca.
- `src/app/not-found.tsx`: página neutra.
- `src/app/sitemap.ts`, `src/app/robots.ts`: por host.
- `src/app/googleecdb70d74ecd3e26.html/route.ts`: a verificação do Search
  Console só no site da Next Home (L51); o arquivo sai de `public/`.
- `src/lib/queries.ts`, `src/lib/corretorAtivo.ts`: o grupo vira argumento
  (some `grupoDoSite()`).
- Páginas e componentes públicos que leem `site.*`: recebem a marca do site.
- `src/lib/dadosEstruturados.ts`: JSON-LD pela marca do site.
- Pixel: `integracaoLiberada(site.grupoId, "pixel")`.
- `docs/SITES-POR-ENDERECO.md`: passos do dono (Vercel, DNS na Hostinger,
  cadastro do endereço no banco).

## Testes (TDD)

- `endereco.test.ts`: normalização, gratuito, desenvolvimento.
- `marca.test.ts`: grupo 1 = marca da casa; outro grupo sem contato da Next
  Home.
- `resolver.test.ts`: caminho rápido da Next Home sem banco; host desconhecido
  → nulo; grupo encerrado → nulo.
- `proxy.test.ts`: reescrita e exceções; `/s/...` de fora não atravessa.
- `enderecosDoSite.db.test.ts`: função devolve o grupo do host; anon não lê a
  tabela; encerrado sem site; um principal por grupo.
- Guardas atualizadas: `semGrupoDoSiteNoPainel` (o painel não resolve site),
  `cascaEstatica`, `seo`, caminhos dos testes que leem as páginas.
- Guarda nova: nenhuma página pública usa `site.` da Next Home para contato
  (usa a marca do site).

## Medida

`next build` antes/depois (tabela de rotas) e TTFB local com `next start`
(`x-nextjs-cache`) na home, `/sobre` e ficha do imóvel, para o host da Next
Home e para um host de outro grupo.
