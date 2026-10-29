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
