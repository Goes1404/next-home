# Performance medida — 2026-10-12 (primeira visita, com a vinheta)

Base: `http://localhost:3001` · rodadas por página: 3 · valores = MEDIANA.
Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.
Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.
| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | celular | **1,94 s** | `img.fundo-poster.absolute.inset-0` | 0,000 | 58 ms | 944 ms | 55 KB | 759 KB | 230 KB | 113 KB | 31 KB | 32 KB |
| `/empreendimentos` | celular | **4,27 s** | `img.object-cover.transition-transform.duration-700` | 0,000 | 62 ms | 1202 ms | 85 KB | 753 KB | 230 KB | 113 KB | 0 KB | 0 KB |
| `/empreendimentos/eternity-alphaville` | celular | **1,87 s** | `h1.text-fluid-5xl.max-w-[12ch].leading-[0.98]` | 0,000 | 37 ms | 1725 ms | 49 KB | 946 KB | 240 KB | 113 KB | 0 KB | 0 KB |
| `/financiamento` | celular | **1,65 s** | `img.fundo-poster.absolute.inset-0` | 0,000 | 39 ms | 582 ms | 28 KB | 754 KB | 230 KB | 113 KB | 31 KB | 32 KB |
| `/` | desktop | **0,89 s** | `video.h-full.w-full` | 0,000 | 40 ms | 94 ms | 55 KB | 776 KB | 230 KB | 113 KB | 190 KB | 719 KB |
| `/empreendimentos` | desktop | **0,98 s** | `video.h-full.w-full` | 0,000 | 49 ms | 79 ms | 85 KB | 753 KB | 230 KB | 113 KB | 158 KB | 719 KB |
| `/empreendimentos/eternity-alphaville` | desktop | **1,06 s** | `video.h-full.w-full` | 0,000 | 29 ms | 314 ms | 49 KB | 946 KB | 240 KB | 113 KB | 158 KB | 719 KB |
| `/financiamento` | desktop | **0,79 s** | `video.h-full.w-full` | 0,000 | 35 ms | 15 ms | 28 KB | 771 KB | 230 KB | 113 KB | 190 KB | 719 KB |
