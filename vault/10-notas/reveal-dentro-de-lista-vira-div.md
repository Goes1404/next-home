---
title: Reveal dentro de lista vira <div>
tags: [front, gsap, defeito]
type: nota
status: estavel
custou: 30 min
codigo: src/components/motion/Reveal.tsx, src/components/home/Regioes.tsx, src/app/(institucional)/regioes/[slug]/page.tsx, src/app/(institucional)/financiamento/page.tsx
created: 2026-09-10
updated: 2026-09-10
fonte: validação cruzada entre sessões, 10/09/2026
summary: <Reveal> renderiza div por padrão; embrulhar <li> nele produz <ul><div><li>, que o leitor de tela não anuncia como lista. Usar as="li". O mesmo defeito foi repetido três vezes no mesmo dia depois de já ter sido corrigido por outra sessão.
---

# Reveal dentro de lista vira `<div>`

## O defeito

`<Reveal>` (`src/components/motion/Reveal.tsx`) renderiza `div` por padrão.
Escrever

```tsx
<ul>
  {itens.map((i) => (
    <Reveal key={i.id}><li>…</li></Reveal>
  ))}
</ul>
```

produz `<ul><div><li>`. O navegador tolera; o leitor de tela **para de
anunciar "lista de N itens"** — que é exatamente o que a grade diz a quem
enxerga. Build, tipos e testes seguem verdes.

## Por que aconteceu três vezes

A outra sessão corrigiu isso na seção "Do primeiro clique à visita" da home.
No mesmo dia eu tinha escrito três listas novas com o mesmo padrão: cartões
de região, imóveis de `/regioes/[slug]` e sugestões de `/financiamento`.
**Ler uma correção alheia e não procurar o mesmo defeito no que se acabou
de escrever** é o que deixou o padrão vivo.

## A regra

- Embrulhar item de lista em componente de movimento: **conferir a tag que
  ele renderiza.** `Reveal` aceita `as="li"`; usar
  `<Reveal as="li" className="h-full">…</Reveal>` e nada de `<li>` dentro.
- Depois de ler uma correção de outra sessão, `grep` pelo padrão no diff do
  dia.

## Armadilha vizinha do mesmo dia

`.next/types/validator.ts` envelhece com a árvore de rotas. Depois que a
outra sessão apagou rotas de API, o `tsc` acusava TS2307 em arquivo GERADO.
Sintoma reconhecível: caminho do erro começa em `.next/`. `rm -rf
.next/types` + build regenera.

## Relacionados

- [[camada-e-reveal-nunca-no-mesmo-no]]
- [[testes-que-leem-o-codigo]]
- [[a-resposta-de-chip-era-jogada-fora]] — mesma rodada de validação cruzada
