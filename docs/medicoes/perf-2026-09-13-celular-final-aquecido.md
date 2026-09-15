# Performance medida — 2026-09-13 (primeira visita, com a vinheta)

Base: `https://next-home-drab.vercel.app` · rodadas por página: 3 · valores = MEDIANA.
Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.
Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.
| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | celular | **3,17 s** | `img.fundo-poster.fundo-encaixa-na-tela.absolute` | 0,000 | 118 ms | 1505 ms | 27 KB | 764 KB | 178 KB | 113 KB | 216 KB | 0 KB |
| `/empreendimentos` | celular | **3,67 s** | `img.object-cover.transition-transform.duration-700` | 0,000 | 115 ms | 1503 ms | 27 KB | 745 KB | 178 KB | 113 KB | 254 KB | 0 KB |
| `/empreendimentos/eternity-alphaville` | celular | **4,20 s** | `h1.text-fluid-5xl.max-w-[12ch].leading-[0.98]` | 0,000 | 109 ms | 1902 ms | 23 KB | 944 KB | 189 KB | 113 KB | 59 KB | 0 KB |
