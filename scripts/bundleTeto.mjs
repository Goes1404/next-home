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
 * rota como o manifesto a nomeia (`/s/[site]/(institucional)/page`), ou `*` para o
 * padrão. A régua: número que só desce. Baixar o teto quando uma fase do
 * roadmap de performance emagrecer a rota é obrigação, não capricho — teto
 * folgado é catraca que não catraca.
 */
const TETOS_KB = {
  "/corretor/(painel)/leads/page": 740, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  // 12/10/2026: a catraca desceu em TODA rota, pelos dois cortes do dia.
  // (1) GSAP + ScrollTrigger + Lenis saíram do painel: o layout raiz monta o
  // `SmoothScroll` por `MovimentoDoSite`, que só o carrega (dynamic) fora de
  // `/corretor` — o painel não tinha um ScrollTrigger e pagava ~120 KB por
  // tela; nas rotas públicas só o Lenis virou assíncrono (-18 KB). (2) O
  // supabase-js do navegador (245 KB) passou a chegar por `import()` no
  // efeito/handler que o usa (`clientSobDemanda.ts`): Pessoas 1.019 → 712,
  // Conversas 1.056 → 749, Criar arte 1.024 → 717, Criar vídeo 1.016 → 709,
  // Importar do imóvel 1.034 → 726. O padrão (`*`) desceu de 800 para 738:
  // a rota mais pesada sem teto próprio é Leads, com 737.
  // Painel: as telas de chat (Pessoas, Conversas, Estúdio) carregam ~1.030 KB
  // porque `Chat.tsx` e `ChatBase` entram estáticos — é a F4 que os move
  // para `next/dynamic`, e aí este número desce.
  "*": 738,
  "/corretor/(painel)/funil/page": 739, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  // As cinco telas de chat: `Chat` e `ChatBase` já vão por `next/dynamic`
  // (F4); o que sobra é o supabase-js (245 KB, Realtime) e o GSAP (111 KB)
  // que o layout RAIZ monta em toda rota — inclusive no painel. Tirar os
  // dois do painel é a F4b.
  // 30/09: +3 KB em toda rota do painel com folga curta: os contadores do
  // menu (visitas de hoje, respostas sem revisão, fila, número no ar) e a
  // barrinha de carregamento dos links (`useLinkStatus`). O menu vai em
  // toda rota do painel.
  // 03/10: +5 KB em pessoas e +7 em conversas, de 7e2b2d0 a 0152: o perfil
  // do lead dentro da conversa (`resumoDoLead`), a frase de por que a IA
  // responde ou não (`decidirSeAIaResponde` no cliente) e "IA assume agora".
  // A esteira estava vermelha desde então, sem ninguém ver.
  // 06/10: +1 KB nas quatro rotas abaixo: o "3/7" de tentativas no cartão
  // (higieneDaBase) e o funil de 10 etapas com grupos (types.ts), que todas
  // puxam pelos utilitários de lead.
  // 07/10: +1 KB: o menu ganhou "Alertas e IA" no Financeiro.
  "/corretor/(painel)/pessoas/page": 715, // 20/10: medida do CI com a fase 2A (convite e plataforma)
  // 28/09: +9 KB (conversas) e +16 (importar) vêm de funcionalidades pedidas:
  // o painel ganhou a transição de tela e a luz dos cartões no LAYOUT (vale
  // em toda rota do painel), e o importador ganhou tours, vídeo em arquivo e
  // a leitura do site da construtora.
  // 29/09: +2 KB em conversas, do motivo do 👎 e do resumo semanal das
  // avaliações (0131), que já tinha ido ao ar 1 KB acima do teto.
  "/corretor/(painel)/conversas/page": 753, // 21/10: medida do CI com a fase 2B
  // 28/09: +1 KB em criar-imagem, editor do imóvel e vídeo é
  // `mensagensDoSite` (as mensagens que o porteiro reconhece), puxado via
  // `site.ts`. Sem ela, o visitante novo do site é ignorado pelo webhook.
  "/corretor/(painel)/imoveis/criar-imagem/page": 719, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  // 30/09: +1 KB. Três ícones novos no menu (Construtoras, Crédito e Marca
  // tinham ícone repetido); o menu vai em toda rota do painel.
  "/corretor/(painel)/imoveis/[slug]/importar/page": 728, // 14/10: +1 KB, cor por seção da Administração no menu (moduloDaSecao, no layout)
  // O editor do imóvel mostra na mesma tela as unidades, o andamento da obra
  // e os leads que combinam (com "reabrir perdidos"): 26/09.
  "/corretor/(painel)/imoveis/[slug]/page": 784, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  "/corretor/(painel)/marketing/video/page": 711, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  // 03/10: +7 KB nas listas de transmissão (0153-0155): pausar, cancelar,
  // variáveis, A/B que decide sozinho e o motivo do limite do dia, tudo no
  // assistente. Vermelho desde 04/10 sem ninguém ver.
  // 07/10: +1 KB: o menu ganhou Fiscal e Contador (navegação vai em toda rota).
  "/corretor/(painel)/campanhas/page": 752, // 14/10: +1 KB, cor por seção da Administração no menu (moduloDaSecao, no layout)
  // 09/10: +8 a +10 KB em toda rota do painel com teto próprio, e as duas
  // de teto padrão abaixo: a lateral do computador que recolhe em trilho de
  // ícones (cartões, cookie) e o cabeçalho que some ao rolar no celular. Os
  // dois moram no layout, então pesam em toda rota do painel.
  "/corretor/(painel)/marketing/impulsionamentos/page": 753, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  // 16/10: a ficha do lead ganhou a seção Documentação (0179): conferir e
  // recusar com motivo, lista por fase editável, anexar e o .zip montado no
  // navegador (o montador do zip vai por import() no clique).
  // 16/10: +1 KB, anexo em dois tempos (autoriza, sobe direto ao armazenamento,
  // confere); o redutor de foto e o envio vão por import() no clique.
  "/corretor/(painel)/leads/[id]/page": 755, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  "/corretor/(painel)/importar/page": 748, // 20/10: medida do CI depois da notificação no celular, roleta e campos da planta
  // Site público — os números da linha de base de 13/09, sem folga: nenhuma
  // rota pública pode engordar um chunk sem alguém explicar por quê.
  // 28/09: +3 KB na home e +7 na listagem são o coração de favorito em cada
  // cartão (comparar imóveis, 26/09) e, na home, o vídeo de fundo do celular
  // que voltou a pedido. O aviso de versão nova e a barra de favoritos já
  // saíram da primeira carga (`components/layout/SobDemanda.tsx`).
  // 02/10: +1 KB em toda rota pública, do Pixel da Meta (PixelMeta.tsx, nos
  // dois layouts públicos), pedido para medir os anúncios.
  // 03/10: +2 KB na home, do fundo da casa no computador e do parallax pelo
  // ponteiro (0151). A esteira estava vermelha desde 04/10.
  "/s/[site]/(institucional)/page": 739,
  "/s/[site]/(institucional)/financiamento/page": 733, // 09/10: +1 KB, a página atual marcada no cabeçalho (LinksDoCabecalho)
  "/s/[site]/(institucional)/regioes/[slug]/page": 721,
  "/s/[site]/(vitrine)/empreendimentos/page": 728, // 09/10: +6 KB, o menu do celular no cabeçalho da vitrine (antes só havia uma seta)
  "/s/[site]/(vitrine)/empreendimentos/[slug]/page": 747,
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
