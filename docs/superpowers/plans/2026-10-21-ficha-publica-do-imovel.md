# Ficha pública do imóvel para imobiliária sem site próprio (21/10/2026)

Continuação de `2026-10-21-marca-do-grupo-no-crm.md` (já publicado). Leia o
relatório dela em `.relatorio-marca.md` e as pendências 2 e 3 do
`docs/HANDOFF-MULTI-GRUPO.md`. Pedido do dono: resolver as duas.

## Problema

Imobiliária (grupo) que NÃO tem endereço próprio em `enderecos_do_site`:
1. Na seleção de imóveis que o cliente recebe (rota de token, abre em
   `astroimob.vercel.app`), clicar num imóvel leva ao login: as páginas de
   imóvel do site não existem no endereço do painel. O link pessoal
   `/?corretor=` desse grupo também cai no login.
2. O link que a IA manda no WhatsApp (apresentação digital, fotos —
   `src/lib/whatsapp/apresentacaoDigital.ts`, `resolverMidia.ts`) usa o
   endereço da Next Home.

## Solução

Uma página pública, fora do segmento do site, que funciona em qualquer
endereço: **`/imovel/[grupo]/[slug]`** (`grupo` = `grupos.slug`; `slug` =
`empreendimentos.slug`), com `?c=<slug do corretor>` opcional.

- Mostra só imóvel PUBLICADO do grupo: fotos (galeria simples), nome,
  bairro/cidade, estágio, tipologias (metragem, dormitórios, vagas),
  descrição e lazer; sem preço se a regra do site não mostra (siga o que a
  página de imóvel do site faz). Marca do grupo no topo (nome/logo da etapa
  anterior). `robots: noindex`.
- Botão de WhatsApp: com `?c=` de um corretor ATIVO do MESMO grupo, abre
  `wa.me/<whatsapp dele>` com mensagem pronta citando o imóvel; sem `c`
  válido, não mostra botão (nada de sortear corretor de outro grupo).
- Leitura pelo servidor com o grupo explícito (`grupo_id` em toda consulta;
  a guarda `portas.test.ts`/`servicoComGrupo` vai cobrar). 404 neutro para
  grupo/imóvel inexistente ou não publicado. Cache curto como as outras
  páginas públicas, se simples.
- `proxy.ts`: `/imovel` entra na lista que NÃO é tratada como página do site
  (`FORA_DO_SITE`) e abre também nos endereços só do painel.
- Função única `linkPublicoDoImovel({ grupoId, slug, corretorSlug? })`:
  grupo 1 → exatamente o link de hoje (`site.url/empreendimentos/<slug>`,
  com o que o código já acrescenta); grupo com endereço principal em
  `enderecos_do_site` → `https://<host>/empreendimentos/<slug>`; grupo sem
  site → `<enderecoDoPainel>/imovel/<grupo>/<slug>?c=<corretor>`.
  Usar em: cartões da seleção de imóveis (página de token), e nos links que
  a IA manda (`apresentacaoDigital.ts`, `resolverMidia.ts` — onde o link é
  montado por código). **Para o grupo 1 o prompt e as mensagens da IA têm
  de ficar byte a byte iguais** (há snapshots; não regenere snapshot para
  esconder diferença).
- Link pessoal (`/?corretor=`) em "Meus links" (`src/app/corretor/(painel)/links/page.tsx`)
  para grupo sem site: em vez do link que cai no login, explicar em uma
  linha que o link pessoal precisa de site próprio e oferecer os links de
  imóvel (`/imovel/...?c=<ele>`) de cada imóvel publicado do grupo.

## Verificação

Igual ao plano anterior: tsc (4 erros conhecidos de PixelMeta), vitest com
`--exclude ".claude/**"`, `npm run db:teste` + `*.db.test.ts` com
`DB_TESTE_URL`, `supabase stop`. Testes novos: a função de link (grupo 1
inalterado, grupo com site, grupo sem site), a página recusa imóvel de outro
grupo e não publicado, o botão só com corretor do grupo, o proxy deixa
`/imovel` abrir no endereço do painel. Atualize vault (nota nova ligada ao
MOC CRM e Painel), fim da `docs/MEMORIA.md` e `docs/HANDOFF-MULTI-GRUPO.md`
(tire as pendências 2 e 3 resolvidas).
