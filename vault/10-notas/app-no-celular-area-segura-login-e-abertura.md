---
title: App no celular — área segura, login novo e abertura animada
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/globals.css
  - src/app/corretor/(painel)/layout.tsx
  - src/app/corretor/areaSeguraDoApp.test.ts
  - src/app/corretor/entrar/page.tsx
  - src/app/corretor/entrar/entrar.module.css
  - src/app/corretor/AberturaDoApp.tsx
  - src/app/corretor/abertura.module.css
  - src/lib/fontesDaAstro.ts
  - test/stubs/next-font-google.ts
  - src/app/corretor/ComportamentoDeApp.tsx
  - public/sw-painel.js
  - public/offline.html
  - src/app/corretor/CampoDeAcesso.tsx
  - src/app/corretor/campoDeAcesso.module.css
  - src/components/tema/SeletorTema.tsx
  - src/app/plataforma/template.tsx
summary: No app Android (Android 15) a página vai por baixo da barra de status e da de gestos; o cabeçalho, as folhas e os flutuantes passaram a reservar as áreas seguras. Login refeito para celular e abertura animada só no app instalado.
created: 2026-10-29
updated: 2026-10-29
---

# App no celular — área segura, login novo e abertura animada

**Relato (29/10/2026):** "o app está cortando algumas partes". O app da Play
Store é um Trusted Web Activity ([[app-android-da-astro]]); no Android 15 a
página é desenhada por baixo da barra de status e da barra de gestos. No
navegador as áreas seguras valem 0, por isso ninguém tinha visto.

## Área segura
- `.pt-safe` (nova, em `globals.css`) no cabeçalho do painel e no da
  plataforma; a medida do cabeçalho (`offsetHeight`) já inclui o recuo.
- `.faixa-de-status`: faixa fixa da cor do fundo atrás do relógio quando o
  cabeçalho some ao rolar; `--painel-topo-visivel` oculto passou de 0 para
  `env(safe-area-inset-top)`.
- **Armadilha:** `pb-safe` junto de `pb-6` — as duas escrevem
  `padding-bottom` e uma anula a outra. As folhas que sobem de baixo usam
  `pb-[calc(1.5rem+env(safe-area-inset-bottom))]`. Travado em
  `areaSeguraDoApp.test.ts`.
- Mascote do consultor e "voltar ao topo" somam `env(safe-area-inset-bottom)`.
- Varredura de 29/10: larguras fixas ≥340px estão todas em tabelas da
  `ROLAGEM_DECLARADA`; as grades de 3–4 colunas são de fotos ou já empilham.

## Login
- Celular primeiro: marca no alto, formulário numa folha clara presa ao pé
  (o botão "Entrar" cabe sem rolar em 360×740; em tela baixa a frase de apoio
  some). Computador: duas colunas. Fontes da Astro (`fontesDaAstro.ts`, as
  mesmas da página de vendas). Único movimento: a órbita se desenhando.

## Abertura animada
- `AberturaDoApp` no layout de `/corretor`: selo se monta em ~2,4 s, toque
  pula. Só com `display-mode: standalone`, 1x por sessão
  (`sessionStorage`), nunca com menos movimento. Script inline antes da
  pintura escreve `data-abertura` no <html>; o elemento nunca sai do DOM
  (hidratação). Fundo #08132a = splash nativo do Android.
- Testes: `next/font/google` ganhou stub em `test/stubs/` (só existe no build).

## Jeito de app, card menor e fundo animado (29/10/2026, segunda leva)
- **Relato:** "parece um site: arrasto para baixo e atualiza". O gesto de
  puxar para atualizar do Chrome é do rolador RAIZ: a regra antiga
  (`overscroll-behavior-y: none`) estava só no <body>.
- `ComportamentoDeApp` (script inline em `/corretor` e `/plataforma`), só com
  `display-mode: standalone`: `data-app` no <html>, zoom travado pela meta
  viewport (a acessibilidade "forçar zoom" do Android passa por cima),
  `contextmenu` cancelado em link/imagem/botão, registro do `sw-painel.js`.
- CSS `html[data-app]`: sem overscroll, sem lampejo azul, sem seleção de
  texto em controles (conteúdo continua selecionável; `.selecionavel` força).
- `sw-painel.js` agora intercepta SÓ navegação: rede primeiro (navigation
  preload), e sem rede mostra `/offline.html` (única coisa em cache). Nunca
  guarda página do CRM.
- Login: card ~25% mais baixo (campos py-3, aviso da senha dentro do rótulo
  "Lembrar meu e-mail", sem alça). Céu animado: névoas derivando, órbita
  balançando, estrelas piscando, cometa a cada ~9 s; nada com menos movimento.
- Conta de demonstração `adm.exemplo@astroimob.vercel.app` teve a senha
  redefinida em 29/10/2026 (com o dono) para o revisor da Play Store.


## Terceira leva (29/10/2026, tarde)
- **Tema:** o seletor tem só claro e escuro (saiu o "padrão do site", ícone
  de computador). Sem cookie, o claro (`TEMA_PADRAO`) aparece marcado.
- **Menu aberto:** `GavetaLateral` marca `data-menu-aberto` no <html>, que
  trava o rolador raiz (no Android o <body> sozinho não segura) — arrastar
  fora do menu não rola nem recarrega a tela de trás.
- **Assistente (mascote):** 80px → 52px no celular, 25% maior no computador;
  "voltar ao topo" desceu junto (6,5rem → 4,5rem acima da barra).
- **Telas de acesso:** `TelaDeAcesso.tsx` + `telaDeAcesso.module.css` (era
  `entrar.module.css`) servem entrar, esqueci a senha, criar senha e trocar
  senha. As três últimas usavam a paleta do site e saíam VERDES da Next Home.
- **Nada corta:** em `[data-rota="painel"]`, item de grid com `min-width: 0`
  e texto com `overflow-wrap: break-word`, tudo em `:where()`
  (especificidade zero). Números grandes (4xl/5xl) um degrau menores no
  celular; valores em reais do Financeiro com tamanho fluido.

## Quarta leva (29/10/2026, tarde): sem as cores da Next, login menor, mais movimento

Pedido: "desvincule as cores da Next com esse app", "o campo de entrar está
muito grande", "mais animações, transições animadas".

- **Site atualiza o app.** O app é TWA: tudo que vai para produção aparece
  no app na próxima abertura. AAB novo só para ícone, nome, splash nativa ou
  permissões ([[app-android-da-astro]]).
- **Cores da Next fora.** O verde vazava pelo que mora FORA do
  `<main data-rota="painel">`: fundo do `<body>` (overscroll, entre telas),
  aviso de versão nova (`bg-brand-500`), seleção de texto, componentes antigos
  com `brand-*`. Solução no fim do `globals.css` ("A Astro sem as cores da
  Next"): `:root:has([data-rota="painel"], [data-astro])` reaponta a família
  `brand-*` para o azul da Astro e o `--color-fundo` do documento para o fundo
  do painel. Marcadores: `data-rota="painel"` (painel e /plataforma),
  `data-astro="acesso"` (TelaDeAcesso), `data-astro="site"` (/astro). Site
  público de imobiliária não tem marcador e segue com a marca do grupo.
- **Barra de status.** `theme-color` vinha de `COR_DA_BARRA` (sálvia/verde do
  site da Next), reescrita pelo script de tema e pelo seletor. Agora:
  `viewport.themeColor` no layout de /corretor e /plataforma (`#e3e8f1`), nas
  4 telas de acesso (`#08132a`), e `SCRIPT_DA_BARRA` (em
  `ComportamentoDeApp.tsx`) observa tema, a própria meta e o DOM e reaplica
  (claro `#e3e8f1`, escuro `#070c16`, ou o `data-cor-da-barra` da tela). Só em
  `/corretor` e `/plataforma`.
- **Campos de acesso.** `CampoDeAcesso` (rótulo flutuante em CSS puro com
  `placeholder=" "`, ícone, olho), `BotaoDeAcesso` (spinner por
  `useFormStatus`, seta) e `ErroDeAcesso` (chega e balança). "Lembrar e-mail"
  e "Esqueci a senha" numa linha só. Folha do login no celular: ~430 → 345 px.
  Títulos das telas de acesso viraram "… · Astro Soluções" (era "· Next Home").
- **Movimento** (fim do `globals.css`, "Mais jeito de app"): toque que afunda
  (`scale .97`, só `hover: none`); cartões que sobem com a rolagem
  (`animation-timeline: view()`, faixa `entry 0px → 140px`, `backwards`, só o
  cartão de fora e nunca um com `.fixed` dentro — `translate` cria bloco de
  contenção); pílula da barra do polegar que cresce + ícone que pula; troca de
  tema em círculo a partir do botão (View Transitions, `data-troca-tema`);
  chegada de tela na /plataforma (`template.tsx`); vibração de 8 ms no app ao
  tocar navegação/enviar/aba (`SCRIPT_DE_APP`). A onda do site não roda mais
  em /plataforma.
- **Conta ADM da plataforma** `adm@astroimob.vercel.app` criada em produção
  por SQL (auth.users + auth.identities + `administradores_da_plataforma`),
  sem ficha de corretor: o login a manda direto para /plataforma. E-mail não
  recebe mensagens; senha com o dono.
- Armadilha de teste: `scrollIntoView` com rolagem suave precisa de ~1 s antes
  de medir a opacidade do cartão.

