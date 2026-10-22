---
title: Meu site — o que cada imobiliária edita no próprio site
tags: [front, painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0209_site_do_grupo.sql
  - supabase/migrations/0210_cores_do_site.sql
  - supabase/migrations/0212_cores_do_modo_escuro.sql
  - src/app/corretor/(painel)/admin/site/SecaoModoEscuro.tsx
  - src/lib/sites/coresDoSite.ts
  - src/lib/imagem/reduzir.ts
  - src/components/grupos/EnviarImagem.tsx
  - src/app/corretor/(painel)/admin/site/SecaoDeCores.tsx
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
summary: O gestor edita quatro cores (principal, secundária, fundo, texto), logo, capa, título, frase, "Sobre" e contatos do site do próprio grupo; o site lê isso para grupos diferentes do 1 (campo vazio cai no padrão) e a Next Home continua vindo de site.ts, travada por teste. A plataforma liga os endereços.
created: 2026-10-21
updated: 2026-10-22
---

# Meu site

Planos: `docs/superpowers/plans/2026-10-21-site-editavel.md` (0209) e `2026-10-21-meu-site-uploads-e-cores.md` (0210, envio de imagem e cores). Migrations 0209 e 0210.

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

## Envio de imagem e quatro cores (0210, 21/10/2026)

- **Envio de logo e capa**: o upload já funcionava; o defeito era de uso (campo
  nativo feio + segundo clique em "Enviar"). `EnviarImagem.tsx` (usado por
  `FormularioDeLogo`, na plataforma e no CRM, e `FormularioDeCapa`): botão
  grande, ao escolher (ou soltar na prévia) reduz no navegador e envia na
  hora, com prévia imediata (`createObjectURL`) e "Enviando…". Redução em
  `lib/imagem/reduzir.ts`: lado maior 2400 px (capa, teto 4 MB, abaixo dos
  4,5 MB de corpo da Vercel) e 800 px (logo, 1 MB); PNG continua PNG (cai
  para WebP só se não couber), JPEG/WebP idem, HEIC vira JPEG se o navegador
  abrir, senão mensagem "tire um print ou exporte como JPG".
- **Colunas** `site_cor_secundaria`, `site_cor_fundo`, `site_cor_texto` (0210,
  hex minúsculo, sem grant). `SiteEditavel` as tem OPCIONAIS no tipo, para os
  testes de igualdade do grupo 1 (fixtures) ficarem intocados.
- **CSS em `:root`, não num envoltório**: `cssDasCoresDoSite` vira um
  `<style>:root{...}</style>` no layout `s/[site]` (fora de `@layer`, vence os
  dois temas). Foi trocado o `div contents` da 0209 porque o fundo pinta o
  `<body>` e o menu do celular é portal (agora também recebe as cores).
- **O que cada cor reaponta**: principal → `--color-acento*` e a escala
  `--color-brand-*` (os botões antigos pedem `bg-brand-500 text-white` por
  classe, inclusive o "Buscar imóveis" do herói; o degrau 500 é escurecido até
  o branco ler, `paraTextoBranco`); secundária → `--color-realce*` e a escala
  `azure` (selo de estágio, mascote); fundo/texto → papéis `fundo`,
  `superficie`, `elevado`, `campo`, `linha*`, `vidro*`, `titulo`, `corpo*`,
  `apoio`, `tenue` e `color-scheme`. Só o fundo ou só o texto: o outro é
  deduzido pelo contraste. O texto de acento é puxado até ler sobre o fundo.
- **Decisão do tema claro/escuro**: com fundo OU texto definidos, as cores
  ficam fixas nos dois temas e o `SeletorTema` some (regra CSS em
  `[role="radiogroup"][aria-label="Tema"]`). Só principal/secundária: o
  seletor segue valendo.
- **Contraste**: WCAG em `siteEditavel.ts` (`contraste`). Aviso texto/fundo
  < 4,5:1 com "Ajustar automaticamente" (`ajustarTexto`); nunca bloqueia salvar.
  O aviso do botão sobre a principal é rede de segurança: o texto sobre a cor
  é o melhor de branco/preto, que nunca fica abaixo de 4,58:1.
- 6 temas prontos em `TEMAS_PRONTOS` (testados: todos passam 4,5:1).
- Grupo 1 intocado: `layout.test.tsx` (HTML idêntico, sem `<style>`),
  `marca.test.ts`, `resolver.test.ts`, `Footer.meuSite.test.tsx`.
- **Modo escuro próprio (0212, 22/10/2026, branch `cores-do-modo-escuro`)**: 4 colunas
  opcionais `site_cor_escuro`, `site_cor_secundaria_escuro`, `site_cor_fundo_escuro`,
  `site_cor_texto_escuro` (mesmo padrão da 0210; sem `admin_eventos` novo). Pedido do
  primeiro cliente (verde-escuro e dourado): claro como está, escuro com as cores dele.
  `cssDasCoresDoSite({..., escuro})`: sem cor do escuro = saída da 0210 byte a byte; com
  cor do escuro o bloco do claro passa a `:root:not([data-tema="escuro"])` (mesmo conteúdo)
  e o escuro ganha `:root[data-tema="escuro"]` (superfícies derivadas do fundo/texto do
  escuro, contraste ajustado sobre ele; principal/secundária que faltarem herdam as do
  claro), e o seletor NUNCA some. Sem escolha do visitante o site abre no padrão (claro;
  `data-tema` do `<html>`), nada lê `prefers-color-scheme`. Tela: seção "Modo escuro"
  (`SecaoModoEscuro.tsx`), prévia escura, aviso de contraste, "Limpar cores do escuro" e o
  tema pronto "Verde e dourado" (`#d4a64b`, `#e8c77e`, `#0e1a10`, `#f3ebd6`, sem ajuste:
  todos passam 4,5:1). Teste de sequência de migrations: 211 declarada em RESERVADOS.
  Grupo 1 intocado (`layout.test.tsx`). Antes do deploy: aplicar a 0212 ANTES do código
  (sem as colunas `lerSiteDoGrupo` cai em 42703 e o site fica em branco).
- Antes do deploy: aplicar a 0210 ANTES do código. `lerSiteDoGrupo` seleciona
  as colunas novas e, com 42703 (0210 não aplicada), devolve o site em branco:
  os grupos perdem por um instante as edições da 0209 em vez de quebrar.
