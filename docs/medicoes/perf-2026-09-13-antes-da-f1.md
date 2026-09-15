# Performance medida — 2026-09-13 (primeira visita, com a vinheta)

Base: `https://next-home-drab.vercel.app` · rodadas por página: 2 · valores = MEDIANA.
Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.
Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.
| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | celular | **7,39 s** | `a.font-display.shrink-0.text-lg` | 0,000 | 1454 ms | 1577 ms | 86 KB | 835 KB | 178 KB | 165 KB | 184 KB | 16 KB |
| `/empreendimentos` | celular | **4,59 s** | `a.font-display.shrink-0.text-lg` | 0,000 | 87 ms | 1577 ms | 27 KB | 745 KB | 178 KB | 165 KB | 254 KB | 1 KB |
| `/empreendimentos/eternity-alphaville` | celular | **4,04 s** | `a.font-display.shrink-0.text-lg` | 0,000 | 113 ms | 2126 ms | 16 KB | 871 KB | 183 KB | 165 KB | 30 KB | 361 KB |
