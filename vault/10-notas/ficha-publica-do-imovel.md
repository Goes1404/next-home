---
title: Ficha pública do imóvel (grupo sem site)
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/imovel/[grupo]/[slug]/page.tsx
  - src/lib/imovelPublico/link.ts
  - src/lib/imovelPublico/ler.ts
  - src/lib/imovelPublico/ficha.ts
  - src/app/s/[site]/(institucional)/selecao/[token]/ir/[slug]/route.ts
  - src/lib/whatsapp/casaDoGrupo.ts
  - src/lib/whatsapp/apresentacaoDigital.ts
  - src/lib/whatsapp/resolverMidia.ts
  - src/app/corretor/(painel)/links/page.tsx
  - src/proxy.ts
summary: Imobiliária sem endereço em enderecos_do_site ganha uma ficha pública em /imovel/<grupo>/<slug>?c=<corretor>, aberta em qualquer endereço; um único montador de link decide o destino do imóvel (Next Home, site do grupo ou ficha) para a seleção do cliente, a IA e as campanhas.
created: 2026-10-21
updated: 2026-10-21
---

# Ficha pública do imóvel (grupo sem site)

Continuação de [[marca-do-grupo-no-crm]]. Plano:
`docs/superpowers/plans/2026-10-21-ficha-publica-do-imovel.md`.

Problema: o cliente de um grupo SEM site abre a seleção em
`astroimob.vercel.app`, mas as páginas de imóvel do site não existem ali (o
proxy manda para o login). E o link que a IA mandava no WhatsApp era sempre o
da Next Home.

- **A página:** `/imovel/<grupos.slug>/<empreendimentos.slug>?c=<corretor>`.
  Só imóvel PUBLICADO do grupo da URL (catálogo cacheado, `grupo_id` na
  leitura); `robots: noindex`; marca do grupo no topo; preço como o site
  mostra. 404 neutro para grupo inexistente, imóvel de outro grupo, não
  publicado e para o grupo 1 (que tem site). Botão de WhatsApp só com `?c=`
  de corretor ATIVO do mesmo grupo (`getCorretorPorSlug(grupoId, …)`); sem
  `c` válido não há botão e nunca se sorteia corretor.
- **Proxy:** `/imovel` entra em `FORA_DO_SITE`: abre em qualquer endereço,
  inclusive nos só do painel, sem reescrita para `/s/<host>`.
- **O montador único** (`imovelPublico/link.ts`, puro): grupo 1 =
  `site.url/empreendimentos/<slug>` (igual a antes); grupo com host em
  `enderecos_do_site` = `https://<host>/empreendimentos/<slug>`; sem site =
  `<enderecoDoPainel>/imovel/<grupo>/<slug>?c=<corretor>`. `ler.ts` lê grupo
  e host (cache de 60 s) e `linkPublicoDoImovel` é a versão assíncrona.
- **Quem usa:** a rota de clique da seleção (`.../selecao/[token]/ir/[slug]`
  redireciona pelo grupo do link); campanhas e aviso de novidade
  (`linkPublicoDoImovel`); a IA via `casa.links` (`LinksDoImovel`, posto por
  `lerCasaDoGrupo` só para grupo ≠ 1). Prompt (`Página no site:`),
  `decidirApresentacao`/`garantirLinkDaPagina` e `anexarLinkDoCatalogo`
  recebem o `links` opcional; sem ele valem os de sempre, então o grupo 1 sai
  byte a byte igual (snapshot do prompt intacto).
- **Meus links:** grupo sem site vê uma linha explicando que o link pessoal
  precisa de site próprio; os links por imóvel viram a ficha com o corretor, e
  o link de anúncio (`/wa/<slug>`, página do site) some.
- **Armadilhas:** `corretores` no segmento `s/` só se lê com colunas públicas
  (`colunasPublicas.test.ts`): a rota usa `corretoresPublicos(grupoId)`. Leitura
  com a chave de serviço nova entra em `servicoComGrupo.test.ts`.
- **Ficou fora:** o link do CATÁLOGO (`?corretor=`) que a IA manda continua o
  da Next Home para grupo sem site (não há página de catálogo para apontar);
  com site próprio já sai o host do grupo.
