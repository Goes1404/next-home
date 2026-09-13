// Catraca de peso do JavaScript por rota — no espírito de `lintTeto.mjs`.
//
// Lê o build (`.next/`) e, para cada rota do App Router, soma o JavaScript
// que o navegador baixa na PRIMEIRA carga: os chunks raiz do runtime
// (`build-manifest.json` da rota) mais os chunks de todo client component
// importado estaticamente na árvore da rota (`page_client-reference-manifest.js`,
// entradas com `async: false` — as carregadas por `next/dynamic` ficam de
// fora, porque só chegam sob demanda).
//
// É uma ESTIMATIVA por manifesto, não a medição no navegador (`npm run perf`
// faz essa). Serve para o que a esteira precisa: reprovar o push que faz uma
// rota engordar acima do teto declarado, antes de alguém medir na mão. A
// linha de base de 13/09/2026 media 740 KB decodificados na listagem — a
// catraca nasce com os números daquele build e só desce.
//
// Uso:
//   node scripts/bundleTeto.mjs            # confere contra os tetos (falha acima)
//   node scripts/bundleTeto.mjs --sugerir  # imprime os tetos que o build atual pediria
//   node scripts/bundleTeto.mjs --detalhe  # lista os chunks e o que mora em cada um
//
// Precisa de um `next build` feito antes (a esteira roda depois do Build).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const NEXT = join(RAIZ, ".next");
const APP = join(NEXT, "server", "app");

/**
 * Tetos em KB (JavaScript DECODIFICADO, o que o navegador executa). Chave =
 * rota como o manifesto a nomeia (`/(institucional)/page`), ou `*` para o
 * padrão. A régua: número que só desce. Baixar o teto quando uma fase do
 * roadmap de performance emagrecer a rota é obrigação, não capricho — teto
 * folgado é catraca que não catraca.
 */
const TETOS_KB = {
  // Painel: as telas de chat (Pessoas, Conversas, Estúdio) carregam ~1.030 KB
  // porque `Chat.tsx` e `ChatBase` entram estáticos — é a F4 que os move
  // para `next/dynamic`, e aí este número desce.
  "*": 1040,
  // Site público — os números da linha de base de 13/09, sem folga: nenhuma
  // rota pública pode engordar um chunk sem alguém explicar por quê.
  "/(institucional)/page": 750,
  "/(institucional)/financiamento/page": 750,
  "/(institucional)/regioes/[slug]/page": 740,
  "/(vitrine)/empreendimentos/page": 730,
  "/(vitrine)/empreendimentos/[slug]/page": 790,
};

function tamanho(caminhoRelativo) {
  const abs = join(NEXT, caminhoRelativo.replace(/^\/_next\//, ""));
  try {
    return statSync(abs).size;
  } catch {
    return 0;
  }
}

function acharManifestos(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) acharManifestos(p, saida);
    else if (nome === "page_client-reference-manifest.js") saida.push(p);
  }
  return saida;
}

/** Extrai, do manifesto da rota, os chunks de cada client module estático. */
function chunksDaRota(manifestoJs) {
  const fonte = readFileSync(manifestoJs, "utf8");
  const rota = fonte.match(/__RSC_MANIFEST\["([^"]+)"\]/)?.[1] ?? relative(APP, manifestoJs);
  const porChunk = new Map(); // chunk → conjunto de módulos do projeto
  const re = /"(\[project\][^"]+)":\{"id":[^,]+,"name":"[^"]*","chunks":\[([^\]]*)\],"async":(true|false)\}/g;
  for (const m of fonte.matchAll(re)) {
    const [, modulo, lista, assinc] = m;
    if (assinc === "true") continue;
    if (modulo.includes("<module evaluation>")) continue;
    const chunks = lista
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""))
      .filter((c) => c.endsWith(".js"));
    // O módulo é atribuído ao PRIMEIRO chunk da lista, que é o dele; os
    // demais são dependências compartilhadas (runtime, react-dom).
    for (const [i, c] of chunks.entries()) {
      if (!porChunk.has(c)) porChunk.set(c, new Set());
      if (i === 0 && modulo.startsWith("[project]/src/")) porChunk.get(c).add(modulo.replace("[project]/", ""));
    }
  }
  // Chunks raiz do runtime da rota.
  const dirRota = manifestoJs.replace(/_client-reference-manifest\.js$/, "");
  const buildManifest = join(dirRota, "build-manifest.json");
  if (existsSync(buildManifest)) {
    const bm = JSON.parse(readFileSync(buildManifest, "utf8"));
    // `polyfillFiles` fica de fora: é o chunk `nomodule`, que navegador
    // moderno nem pede. Contá-lo inflava toda rota em 110 KB e descolava a
    // estimativa do que o `npm run perf` mede no navegador.
    for (const f of bm.rootMainFiles ?? []) {
      const c = "/_next/" + f;
      if (!porChunk.has(c)) porChunk.set(c, new Set(["(runtime)"]));
    }
  }
  return { rota, porChunk };
}

function tetoDe(rota) {
  return TETOS_KB[rota] ?? TETOS_KB["*"];
}

function main() {
  if (!existsSync(APP)) {
    console.error("bundleTeto: não achei .next/server/app — rode `npm run build` antes.");
    process.exit(2);
  }
  const sugerir = process.argv.includes("--sugerir");
  const detalhe = process.argv.includes("--detalhe");
  const manifestos = acharManifestos(APP);
  if (manifestos.length === 0) {
    console.error("bundleTeto: nenhum page_client-reference-manifest.js no build.");
    process.exit(2);
  }

  const linhas = [];
  let reprovadas = 0;
  for (const m of manifestos.sort()) {
    const { rota, porChunk } = chunksDaRota(m);
    let total = 0;
    const detalhes = [];
    for (const [chunk, modulos] of porChunk) {
      const b = tamanho(chunk);
      total += b;
      detalhes.push({ chunk: chunk.replace("/_next/static/chunks/", ""), kb: b / 1024, modulos: [...modulos] });
    }
    const kb = total / 1024;
    const teto = tetoDe(rota);
    const ok = kb <= teto;
    if (!ok) reprovadas += 1;
    linhas.push({ rota, kb, teto, ok, detalhes: detalhes.sort((a, b) => b.kb - a.kb) });
  }

  linhas.sort((a, b) => b.kb - a.kb);
  console.log("rota".padEnd(58) + "JS (KB)".padStart(9) + "teto".padStart(7) + "  estado");
  for (const l of linhas) {
    console.log(
      l.rota.padEnd(58) + Math.round(l.kb).toString().padStart(9) + String(l.teto).padStart(7) + (l.ok ? "  ok" : "  ACIMA DO TETO"),
    );
    if (detalhe) {
      for (const d of l.detalhes.slice(0, 12)) {
        const quem = d.modulos.length ? d.modulos.slice(0, 4).map((x) => x.replace(/^src\//, "")).join(", ") + (d.modulos.length > 4 ? ` +${d.modulos.length - 4}` : "") : "(compartilhado)";
        console.log(`   ${Math.round(d.kb).toString().padStart(6)} KB  ${d.chunk.padEnd(26)} ${quem}`);
      }
    }
  }

  if (sugerir) {
    console.log("\nTetos que o build atual pediria (arredondados para cima, de 10 em 10 KB):");
    for (const l of linhas) console.log(`  "${l.rota}": ${Math.ceil(l.kb / 10) * 10},`);
    return;
  }

  if (reprovadas > 0) {
    console.error(`\nbundleTeto: ${reprovadas} rota(s) acima do teto. Emagreça a rota ou, se o peso é deliberado, suba o teto em scripts/bundleTeto.mjs explicando por quê.`);
    process.exit(1);
  }
  const folga = linhas.filter((l) => l.teto - l.kb > 120);
  if (folga.length > 0) {
    console.log(`\n${folga.length} rota(s) com mais de 120 KB de folga — baixe o teto (\`--sugerir\` imprime os números): catraca folgada não catraca.`);
  }
  console.log("\nbundleTeto: todas as rotas dentro do teto.");
}

main();
