---
title: O movimento do site público é CSS puro — quatro efeitos, zero JavaScript
aliases: [botao-vivo, link-nav, barra-progresso, anel-pulso, animation-timeline]
tags: [front, gsap, decisao]
type: decisao
status: growing
custou: baixo
codigo: [src/app/globals.css, src/components/layout/WhatsappCta.tsx, src/components/layout/HeaderInstitucional.tsx, src/components/layout/SiteHeader.tsx, src/app/(institucional)/layout.tsx, src/app/(vitrine)/layout.tsx]
created: 2026-09-13
updated: 2026-09-13
fonte: pedido do usuário ("foque em animações, transições e efeitos; deixe leve e rápido"), medido no navegador
summary: Quatro efeitos entraram no site público sem uma linha de JavaScript novo — botão que levanta no hover, sublinhado que cresce no menu, barra de progresso de leitura por `animation-timeline: scroll()` e anel do WhatsApp que pulsa a cada 6s. Régua igual à do painel: movimento responde a gesto ou mostra conteúdo. Bundle dentro do teto; medido no navegador.
---
# O movimento do site público é CSS puro

Pedido: *"foque o resto em animações, transições e efeitos; deixe ele leve e
rápido"*. As duas metades do pedido só cabem juntas se o movimento não
custar JavaScript — e a outra sessão tinha acabado de passar quatro fases
apertando o bundle (`bundle:teto`). Tudo aqui é CSS.

## Os quatro efeitos

| efeito | onde | mecanismo |
|---|---|---|
| `botao-vivo` | 21 CTAs sólidos de marca (`bg-brand-500`/`bg-acento` + `rounded-`) | `@utility` com `transition` + `translateY(-2px)` no hover e `scale(.98)` no toque |
| `link-nav` | links dos dois headers | `::after` com `scaleX(0 → 1)` no hover e na rota atual |
| `.barra-progresso` | topo dos dois layouts públicos | `animation-timeline: scroll(root)`, dentro de `@supports` — quem não suporta não vê barra nem erro |
| `anel-pulso` | botão flutuante do WhatsApp | `@keyframes` de 6s, ativo só nos primeiros 22% (expande e some), `motion-safe:` |

## Decisões

- **Régua igual à do painel** ([[movimento-do-painel-tem-regua]]): movimento
  responde a gesto ou mostra conteúdo. O anel é a exceção DECLARADA — é o
  botão de conversão, e some ao rolar no celular.
- **`@utility`, não classe solta**, para `motion-safe:` funcionar: variante
  do Tailwind só se aplica a utility. `.anel-pulso` como classe comum fazia
  `motion-safe:anel-pulso` virar nada, calado.
- **A regex que espalhou `botao-vivo` mordeu três não-botões** (um selo, um
  ponto decorativo, um parágrafo) porque a régua era só "cor de marca +
  arredondado". Removidos à mão; a lição é a de sempre — regex sobre
  className precisa de um segundo filtro de TAG.
- **`prefers-reduced-motion` já zera tudo** no bloco global; nenhum efeito
  precisou de regra própria.

## Medido no navegador (build de produção, 1440px)

- Barra: `scaleX(0)` no topo, `scaleX(0.32)` na metade da página.
- Botão: `matrix(1,0,0,1,0,-2)` no hover.
- Sublinhado: `scaleX(0 → 1)` no hover.
- Anel: `animationName: anel-pulso`.
- `bundle:teto`: todas as rotas dentro do teto (nada de JS entrou).
- Sem estouro de largura; os únicos 404 locais são `/_vercel/insights` e
  `/_vercel/speed-insights`, que só existem na Vercel.

## A auditoria do mesmo dia

Depois do movimento, uma varredura por script (12 rotas × 2 viewports)
achou o que a inspeção visual não tinha visto: fotos de corretor de 120px
esticadas a 370 (cartão virou retrato circular no tamanho da foto), salto
de h1 para h3 na listagem (o cartão ganhou prop `nivel`), oito alvos de
toque abaixo de 40px e quatro textos abaixo de 12px. Detalhe em
`docs/MEMORIA.md` ("Auditoria de qualidade do site público").

## Relacionadas
- [[movimento-do-painel-tem-regua]]
- [[o-conteudo-aparece-antes-do-javascript]]
- [[MOC — Front Público]]
