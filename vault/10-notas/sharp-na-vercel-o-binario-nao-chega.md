---
title: sharp na Vercel — o .so não chega sozinho na função
aliases: [ERR_DLOPEN_FAILED, libvips-cpp]
tags: [infra, midia, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [next.config.ts, src/lib/imoveis/imagemDerivada.ts, src/lib/imoveis/limitesPdf.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — sharp na Vercel (25/08/2026)
summary: Três causas empilhadas; a real era o rastreador não incluir libvips-cpp.so, que ninguém faz require — só dlopen. Resolvido com outputFileTracingIncludes.
---
# `sharp` na Vercel — o `.so` não chega sozinho na função

**Sintoma:** `/corretor/imoveis/[slug]` e `.../importar` caíam com o erro
genérico de Server Components. Build limpo, testes verdes, tudo funcionando
localmente. O erro real só aparece em `get_runtime_errors` da Vercel — o digest
não diz nada:

```
Could not load the "sharp" module using the linux-x64 runtime
ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
```

## Três tentativas, e só a terceira era a causa

1. Um componente `"use client"` importava uma **constante** de um módulo que
   importa `sharp` — isso arrasta o binário nativo para o grafo do cliente.
   Ver [[constante-compartilhada-mora-em-modulo-sem-nativo]].
2. `@img/sharp-linux-x64` e `@img/sharp-libvips-linux-x64` não estavam
   declaradas: o lock é gerado no Windows, onde só o par `win32-x64` se
   instala. Viraram `optionalDependencies` do projeto (não muda nada no Windows
   — opcional de outra plataforma é ignorada no install local).
3. **A causa real:** a pasta `node_modules/@img` chegava à função, mas **sem**
   `lib/libvips-cpp.so.8.18.3`. O rastreador de arquivos não o enxerga porque
   ele **nunca é `require`d** — quem o abre é o binário nativo, por `dlopen`, em
   tempo de execução. Resolvido com `outputFileTracingIncludes` no
   `next.config.ts`, escopado a `/corretor/**` para não engordar a função do
   webhook.

## Duas lições que valem além do sharp

- [[erro-que-so-existe-no-runtime-se-investiga-no-runtime]]
- **Dependência nativa importada no topo do módulo derruba a página inteira** —
  a falha acontece antes de qualquer `try/catch`, e o estrago vaza para telas
  vizinhas (aqui levou junto o editor do imóvel, que só compartilhava a action
  de upload). Hoje o `sharp` é carregado sob demanda, com o resultado em cache,
  e o pior caso é foto sem medida e sem blur.

`sharp` já está na lista de auto-externalizados do Next
(`node_modules/next/dist/lib/server-external-packages.json`), então acrescentá-lo
a `serverExternalPackages` não conserta nada.

## Relacionadas
- [[higiene-real-causa-errada]]
- [[MOC — Ingestão de Mídia]]
