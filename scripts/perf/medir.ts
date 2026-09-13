/**
 * `npm run perf` — a régua de performance do site, medida como o Lighthouse
 * mede e gravada com data.
 *
 * Abre cada página de referência num Chromium do Playwright, com o perfil
 * de CELULAR (Pixel 7, rede "Slow 4G", CPU 4x mais lenta — o perfil de
 * referência do Lighthouse para Android intermediário) e o de DESKTOP
 * (1366×768, rede rápida, CPU sem freio), N rodadas por página, e devolve a
 * MEDIANA de cada métrica. Uma rodada não separa regressão de variância —
 * a lição que este projeto aprendeu no eval de conversa vale aqui.
 *
 * O que mede, e por que cada coisa:
 *
 * - LCP (e qual elemento foi): o número que o Google usa para ranquear e o
 *   que a linha de base de 13/09 mostrou em 10,6 s no celular.
 * - CLS: deslocamento de layout — skeleton que muda de forma ao chegar o
 *   dado aparece aqui, não em teste.
 * - TTFB: a parte do servidor. Com cache na borda cai para ~50 ms; sem, é o
 *   tempo da função mais as idas ao banco.
 * - Tarefas longas depois do load (TBT aproximado): o custo de hidratar e
 *   de os tickers permanentes rodarem.
 * - Bytes por tipo (HTML, JS, CSS, fonte, imagem, mídia): o que de fato
 *   viajou. `transferSize` é o que a rede carregou (comprimido);
 *   `decodedBodySize` é o que o navegador teve de processar.
 *
 * Cada rodada nasce num contexto NOVO — sem cookie, sem `sessionStorage` —
 * porque é isso que o visitante de primeira vez tem. Com `--sem-vinheta` o
 * `sessionStorage` recebe a marca `nh-intro-vista` antes de qualquer script
 * da página (é a mesma chave que o Preloader lê), e a medição passa a ser
 * a do visitante que já viu a abertura. Os dois números importam, e são
 * diferentes: a linha de base foi medida sem a vinheta por acidente, e é
 * por isso que a data e o modo ficam gravados no nome do arquivo.
 *
 * Uso:
 *   npm run perf                              # produção, 3 rodadas, os dois perfis
 *   npm run perf -- --base=http://localhost:3000
 *   npm run perf -- --rodadas=5 --perfil=celular --sem-vinheta
 *   npm run perf -- --paginas=/,/empreendimentos --sem-gravar
 *   npm run perf -- --rotulo=antes-da-f2    # nome do arquivo ganha o rótulo
 *
 * O arquivo de saída é por data — duas rodadas no mesmo dia se SOBRESCREVEM
 * (a armadilha que o eval de conversa já mordeu três vezes). `--rotulo` é o
 * que separa "antes" de "depois" quando os dois cabem numa tarde.
 *
 * No Git Bash do Windows, `--paginas=/` vira `C:/Program Files/Git/` (a
 * conversão de caminho do MSYS) — rode com `MSYS_NO_PATHCONV=1` na frente
 * ou pelo PowerShell.
 */
import { chromium, devices, type BrowserContextOptions } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Perfil = "celular" | "desktop";

type Medida = {
  lcp: number | null;
  lcpElemento: string | null;
  cls: number;
  ttfb: number;
  domContentLoaded: number;
  load: number;
  tarefasLongasMs: number;
  html: { transfer: number; decoded: number };
  tipos: Record<string, { n: number; transfer: number; decoded: number }>;
};

type Resultado = {
  pagina: string;
  perfil: Perfil;
  rodadas: Medida[];
  mediana: Medida;
};

const PAGINAS_PADRAO = ["/", "/empreendimentos", "/empreendimentos/eternity-alphaville", "/financiamento"];

/** Lighthouse "Slow 4G" (mobile): 150 ms de RTT, 1,6 Mbps down, 750 kbps up. */
const REDE: Record<Perfil, { latency: number; downloadThroughput: number; uploadThroughput: number }> = {
  celular: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  desktop: { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 },
};
const CPU: Record<Perfil, number> = { celular: 4, desktop: 1 };

function lerArgs() {
  const args = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args.set(m[1], m[2] ?? "true");
  }
  const perfilArg = args.get("perfil") ?? "ambos";
  const perfis: Perfil[] = perfilArg === "ambos" ? ["celular", "desktop"] : [perfilArg as Perfil];
  return {
    base: (args.get("base") ?? "https://next-home-drab.vercel.app").replace(/\/$/, ""),
    rodadas: Number(args.get("rodadas") ?? 3),
    paginas: (args.get("paginas")?.split(",") ?? PAGINAS_PADRAO).map((p) => p.trim()).filter(Boolean),
    perfis,
    semVinheta: args.has("sem-vinheta"),
    gravar: !args.has("sem-gravar"),
    rotulo: args.get("rotulo") ?? "",
  };
}

/** Roda antes de qualquer script da página: instala os observadores. */
const SCRIPT_OBSERVADORES = `
  window.__perf = { lcp: null, lcpElemento: null, cls: 0, longas: 0 };
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__perf.lcp = e.startTime;
        const el = e.element;
        window.__perf.lcpElemento = el
          ? el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "")
          : (e.url || "?");
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) window.__perf.longas += Math.max(0, e.duration - 50);
    }).observe({ type: "longtask", buffered: true });
  } catch {}
`;

const SCRIPT_SEM_VINHETA = `try { sessionStorage.setItem("nh-intro-vista", "1"); } catch {}`;

/** Lê as métricas acumuladas pelos observadores mais o que o Performance API já tem. */
const SCRIPT_MEDIDA = String.raw`(() => {
  const perf = window.__perf;
  const nav = performance.getEntriesByType("navigation")[0];
  const classificar = (nome, iniciador) => {
    if (/_rsc=/.test(nome)) return "rsc-prefetch";
    if (iniciador === "img" || /\/_next\/image|\.(jpe?g|png|webp|avif|gif|svg)(\?|$)/i.test(nome)) return "imagem";
    if (/\.js(\?|$)/.test(nome)) return "js";
    if (/\.css(\?|$)/.test(nome)) return "css";
    if (/\.woff2?(\?|$)/.test(nome)) return "fonte";
    if (/\.(webm|mp4|m4v|mov)(\?|$)/.test(nome)) return "midia";
    return "outro";
  };
  const tipos = {};
  for (const r of performance.getEntriesByType("resource")) {
    const t = classificar(r.name, r.initiatorType);
    tipos[t] = tipos[t] || { n: 0, transfer: 0, decoded: 0 };
    tipos[t].n += 1;
    tipos[t].transfer += r.transferSize;
    tipos[t].decoded += r.decodedBodySize;
  }
  return {
    lcp: perf.lcp,
    lcpElemento: perf.lcpElemento,
    cls: perf.cls,
    ttfb: nav.responseStart,
    domContentLoaded: nav.domContentLoadedEventEnd,
    load: nav.loadEventEnd,
    tarefasLongasMs: perf.longas,
    html: { transfer: nav.transferSize, decoded: nav.decodedBodySize },
    tipos,
  };
})()`;

async function medirUma(base: string, pagina: string, perfil: Perfil, semVinheta: boolean): Promise<Medida> {
  const browser = await chromium.launch();
  const opcoes: BrowserContextOptions =
    perfil === "celular"
      ? { ...devices["Pixel 7"] }
      : { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };
  const contexto = await browser.newContext(opcoes);
  const page = await contexto.newPage();
  const cdp = await contexto.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...REDE[perfil] });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU[perfil] });

  await page.addInitScript(SCRIPT_OBSERVADORES);
  if (semVinheta) await page.addInitScript(SCRIPT_SEM_VINHETA);

  await page.goto(base + pagina, { waitUntil: "load", timeout: 120_000 });

  // O LCP só se estabiliza quando nada maior é pintado por alguns segundos.
  // Espera até 3 s sem mudança, com teto de 15 s depois do load — a vinheta
  // de abertura e as timelines de entrada cabem aí.
  let ultimo = -1;
  let estavelDesde = Date.now();
  const inicio = Date.now();
  while (Date.now() - inicio < 15_000) {
    await page.waitForTimeout(500);
    const lcp = await page.evaluate(() => (window as unknown as { __perf: { lcp: number | null } }).__perf.lcp);
    if (lcp !== ultimo) {
      ultimo = lcp ?? -1;
      estavelDesde = Date.now();
    } else if (Date.now() - estavelDesde >= 3_000) {
      break;
    }
  }

  // O coletor vai como TEXTO, não como função: o `tsx` (esbuild) embrulha
  // toda função nomeada num helper `__name(...)`, e a serialização do
  // Playwright leva o embrulho para a página — onde `__name` não existe
  // ("ReferenceError: __name is not defined"). String pura não passa pelo
  // transformador.
  const medida = (await page.evaluate(SCRIPT_MEDIDA)) as Medida;

  await browser.close();
  return medida;
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function medianaDe(rodadas: Medida[]): Medida {
  const num = (f: (m: Medida) => number) => mediana(rodadas.map(f));
  const tipos: Medida["tipos"] = {};
  for (const chave of new Set(rodadas.flatMap((r) => Object.keys(r.tipos)))) {
    tipos[chave] = {
      n: num((m) => m.tipos[chave]?.n ?? 0),
      transfer: num((m) => m.tipos[chave]?.transfer ?? 0),
      decoded: num((m) => m.tipos[chave]?.decoded ?? 0),
    };
  }
  // O elemento LCP é o da rodada mediana em LCP — não faz sentido tirar
  // mediana de um nome.
  const lcps = rodadas.map((r) => r.lcp ?? Infinity);
  const alvo = mediana(lcps);
  const representante = rodadas.find((r) => (r.lcp ?? Infinity) === alvo) ?? rodadas[0];
  return {
    lcp: rodadas.every((r) => r.lcp === null) ? null : num((m) => m.lcp ?? Infinity),
    lcpElemento: representante.lcpElemento,
    cls: num((m) => m.cls),
    ttfb: num((m) => m.ttfb),
    domContentLoaded: num((m) => m.domContentLoaded),
    load: num((m) => m.load),
    tarefasLongasMs: num((m) => m.tarefasLongasMs),
    html: { transfer: num((m) => m.html.transfer), decoded: num((m) => m.html.decoded) },
    tipos,
  };
}

const s = (ms: number | null) => (ms === null || !Number.isFinite(ms) ? "—" : `${(ms / 1000).toFixed(2).replace(".", ",")} s`);
const kb = (b: number) => `${Math.round(b / 1024)} KB`;

function tabela(resultados: Resultado[]): string {
  const linhas = [
    "| página | perfil | LCP | elemento | CLS | TTFB | tarefas longas | HTML gz | JS (dec.) | CSS | fontes | imagens | mídia |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of resultados) {
    const m = r.mediana;
    const t = (k: string) => (m.tipos[k] ? kb(m.tipos[k].decoded) : "0 KB");
    linhas.push(
      `| \`${r.pagina}\` | ${r.perfil} | **${s(m.lcp)}** | \`${m.lcpElemento ?? "?"}\` | ${m.cls.toFixed(3).replace(".", ",")} | ${Math.round(m.ttfb)} ms | ${Math.round(m.tarefasLongasMs)} ms | ${kb(m.html.transfer)} | ${t("js")} | ${t("css")} | ${t("fonte")} | ${m.tipos.imagem ? kb(m.tipos.imagem.transfer) : "0 KB"} | ${m.tipos.midia ? kb(m.tipos.midia.transfer) : "0 KB"} |`,
    );
  }
  return linhas.join("\n");
}

async function main() {
  const cfg = lerArgs();
  const resultados: Resultado[] = [];
  console.log(
    `perf · base=${cfg.base} · rodadas=${cfg.rodadas} · perfis=${cfg.perfis.join(",")} · ${cfg.semVinheta ? "SEM vinheta (sessionStorage marcado)" : "COM vinheta (primeira visita)"}`,
  );

  for (const perfil of cfg.perfis) {
    for (const pagina of cfg.paginas) {
      const rodadas: Medida[] = [];
      for (let i = 0; i < cfg.rodadas; i++) {
        const m = await medirUma(cfg.base, pagina, perfil, cfg.semVinheta);
        rodadas.push(m);
        console.log(`  ${perfil.padEnd(7)} ${pagina.padEnd(40)} rodada ${i + 1}: LCP ${s(m.lcp)} · TTFB ${Math.round(m.ttfb)} ms · CLS ${m.cls.toFixed(3)}`);
      }
      resultados.push({ pagina, perfil, rodadas, mediana: medianaDe(rodadas) });
    }
  }

  const md = tabela(resultados);
  console.log("\n" + md);

  if (cfg.gravar) {
    const data = new Date().toISOString().slice(0, 10);
    // O perfil entra no nome quando é UM só: `--perfil=celular` e depois
    // `--perfil=desktop` com o mesmo rótulo sobrescreviam o mesmo arquivo —
    // aconteceu na F2, e a rodada do celular sobreviveu só no terminal.
    const perfil = cfg.perfis.length === 1 ? `-${cfg.perfis[0]}` : "";
    const sufixo = perfil + (cfg.semVinheta ? "-sem-vinheta" : "") + (cfg.rotulo ? `-${cfg.rotulo}` : "");
    const dir = join(process.cwd(), "docs", "medicoes");
    mkdirSync(dir, { recursive: true });
    const nome = `perf-${data}${sufixo}`;
    const cabecalho = [
      `# Performance medida — ${data}${cfg.semVinheta ? " (sem a vinheta)" : " (primeira visita, com a vinheta)"}`,
      "",
      `Base: \`${cfg.base}\` · rodadas por página: ${cfg.rodadas} · valores = MEDIANA.`,
      "Celular = Pixel 7, Slow 4G (150 ms RTT, 1,6 Mbps), CPU 4x. Desktop = 1366×768, rede rápida, CPU 1x.",
      "Gerado por `npm run perf` (`scripts/perf/medir.ts`). Régua: LCP bom ≤ 2,5 s, ruim > 4,0 s; CLS bom ≤ 0,1.",
      "",
    ].join("\n");
    writeFileSync(join(dir, `${nome}.md`), cabecalho + md + "\n");
    writeFileSync(join(dir, `${nome}.json`), JSON.stringify(resultados, null, 2));
    console.log(`\ngravado em docs/medicoes/${nome}.md e .json`);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
