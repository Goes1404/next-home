# Performance medida — 2026-10-12 (primeira visita, com a vinheta)

Base: `http://localhost:3000` · rodadas por página: 3 · valores = MEDIANA.
Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.
Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.
| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | celular | **1,98 s** | `img.fundo-poster.absolute.inset-0` | 0,000 | 51 ms | 831 ms | 56 KB | 769 KB | 230 KB | 113 KB | 31 KB | 203 KB |
| `/empreendimentos` | celular | **4,29 s** | `img.object-cover.transition-transform.duration-700` | 0,000 | 55 ms | 964 ms | 86 KB | 762 KB | 230 KB | 113 KB | 0 KB | 0 KB |
| `/empreendimentos/eternity-alphaville` | celular | **1,93 s** | `h1.text-fluid-5xl.max-w-[12ch].leading-[0.98]` | 0,000 | 29 ms | 1607 ms | 50 KB | 956 KB | 240 KB | 113 KB | 0 KB | 0 KB |
| `/financiamento` | celular | **1,63 s** | `img.fundo-poster.absolute.inset-0` | 0,000 | 35 ms | 525 ms | 28 KB | 763 KB | 230 KB | 113 KB | 31 KB | 203 KB |
| `/` | desktop | **0,85 s** | `video.h-full.w-full` | 0,000 | 34 ms | 74 ms | 56 KB | 795 KB | 230 KB | 113 KB | 190 KB | 499 KB |
| `/empreendimentos` | desktop | **0,92 s** | `video.h-full.w-full` | 0,000 | 40 ms | 55 ms | 86 KB | 762 KB | 230 KB | 113 KB | 158 KB | 499 KB |
| `/empreendimentos/eternity-alphaville` | desktop | **0,98 s** | `video.h-full.w-full` | 0,000 | 24 ms | 308 ms | 50 KB | 956 KB | 240 KB | 113 KB | 158 KB | 499 KB |
| `/financiamento` | desktop | **0,83 s** | `video.h-full.w-full` | 0,000 | 24 ms | 42 ms | 28 KB | 789 KB | 230 KB | 113 KB | 190 KB | 499 KB |
