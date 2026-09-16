# Performance medida — 2026-09-13 (primeira visita, com a vinheta)

Base: `https://next-home-drab.vercel.app` · rodadas por página: 3 · valores = MEDIANA.
Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.
Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.
| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/empreendimentos/eternity-alphaville` | celular | **4,70 s** | `h1.text-fluid-5xl.max-w-[12ch].leading-[0.98]` | 0,000 | 162 ms | 2255 ms | 22 KB | 943 KB | 189 KB | 113 KB | 59 KB | 0 KB |
| `/` | celular | **2,86 s** | `a.font-display.shrink-0.text-lg` | 0,000 | 92 ms | 1310 ms | 27 KB | 763 KB | 178 KB | 113 KB | 144 KB | 0 KB |
