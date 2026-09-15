# Performance medida — 2026-09-13 (primeira visita, com a vinheta)

Base: `https://next-home-drab.vercel.app` · rodadas por página: 2 · valores = MEDIANA.
Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.
Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.
| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | desktop | **1,43 s** | `video.h-full.w-full` | 0,000 | 119 ms | 126 ms | 27 KB | 780 KB | 178 KB | 113 KB | 129 KB | 720 KB |
| `/empreendimentos` | desktop | **1,86 s** | `video.h-full.w-full` | 0,000 | 132 ms | 99 ms | 27 KB | 745 KB | 178 KB | 113 KB | 399 KB | 719 KB |
