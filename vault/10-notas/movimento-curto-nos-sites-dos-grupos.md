---
title: Movimento curto nos sites dos outros grupos (Aretz escura e rápida)
tags: [front, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/s/[site]/layout.tsx
  - src/components/motion/ritmo.ts
  - src/components/motion/Reveal.tsx
  - src/components/motion/TituloEditorial.tsx
fonte: pedido do Matheus para a Aretz, 26/10/2026
summary: Site de grupo ≠ 1 sai com transições curtas (sem a onda, entrada 160 ms, GSAP pela metade); a Aretz ficou só no escuro por cor fixa no banco.
updated: 2026-10-26
---

# Movimento curto nos sites dos outros grupos

Pedido (26/10/2026, Aretz): "deixe o site mais rápido, as transições".

- O layout `src/app/s/[site]/layout.tsx` injeta, só quando a marca não é a
  Next Home, um `<style>` fora de `@layer`: a onda entre páginas cai para
  1 ms (ainda dispara o `animationend` que a desmonta e limpa
  `data-entrando`), a página nova entra em 160 ms, a travessia
  `nav-forward` em 200 ms e `--ritmo-do-movimento:0.5`.
- `ritmoDoMovimento()` lê essa variável; `Reveal` e `TituloEditorial`
  multiplicam duração, atraso e cascata por ela. Sem a variável (Next Home)
  o ritmo é 1: nada muda lá, e o teste do layout trava isso.
- O movimento reduzido continua vencendo: o `!important` dele está em camada.

## Aretz só no tema escuro (sem código)

- Cores da Aretz vivem em `grupos.site_cor*` (o editor "Meu site" foi
  removido em 22/10, então a mudança é por SQL). O fundo do logo é
  `#0e1a10` (verde quase preto) e o dourado `#c49c4e`.
- Para travar no escuro e sumir o seletor de tema: pôr a paleta escura nas
  cores do CLARO (`site_cor`, `_secundaria`, `_fundo`, `_texto`) e zerar as
  `_escuro`. Com fundo/texto fixos e sem cor do escuro, `cssDasCoresDoSite`
  esconde o `radiogroup` "Tema" sozinho.
- **Armadilha:** mudar cor direto no banco não derruba o cache de rota (os
  layouts do site têm `revalidate = 3600` e só as actions chamam
  `revalidarSitePublico`). O visitante segue vendo a cor velha até uma hora;
  um deploy novo zera o cache.

## Relacionadas
- [[meu-site-da-imobiliaria]]
- [[MOC — Front Público]]
