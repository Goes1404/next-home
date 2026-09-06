#!/usr/bin/env node
/**
 * Levantamento dos lançamentos de Barueri — a lista de trabalho do catálogo.
 *
 * ## Por que existe
 *
 * O catálogo da Next Home tem 25 imóveis publicados e buracos que a
 * assistente sente na conversa (16 sem planta, 3 sem tipologia). Antes de
 * preencher, é preciso saber O QUE EXISTE no mercado de Barueri — e a
 * pergunta "quais lançamentos estão em obra agora?" não tinha resposta em
 * lugar nenhum do sistema.
 *
 * ## Por que esta fonte, e não o Órulo
 *
 * O Órulo foi a primeira tentativa (01/09/2026) e não serve: todas as URLs
 * do sitemap apontam para um portal Next.js que exige login — o HTML
 * público é uma casca cujo texto visível é "Entrar / Carregando mapa…" — e
 * os dados vêm de `/api/v2/*`, que o `robots.txt` deles pede explicitamente
 * para crawler não tocar. Sem credencial de parceiro não há o que ler, e
 * com credencial o caminho certo é a API oficial deles, não raspagem.
 *
 * O `apto.vc` é o oposto: servido pronto, `robots.txt` liberando tudo fora
 * de `/plugin`, `/data` e `/preview`, e um `__NEXT_DATA__` estruturado com
 * exatamente os campos que decidem — inclusive `status.name`, que separa
 * "Em construção" de "Pronto para morar".
 *
 * ## O que este script NÃO faz, de propósito
 *
 * Não copia foto, planta nem descrição para o nosso banco. Ele produz uma
 * LISTA DE TRABALHO: o que existe, em que status, e o link. Quem decide o
 * que entra no catálogo é o corretor — e o material publicável vem da
 * construtora, com quem a Next Home já tem relação direta (a ingestão de
 * PDF/Drive do painel já processa isso e já produziu 57 mídias).
 *
 * COMO RODAR:  node scripts/lancamentosBarueri.mjs [--status="Em construção"] [--todos]
 */

const BASE = "https://apto.vc/br/sp/barueri";

/** Identificação honesta: quem está lendo e por quê. */
const AGENTE =
  "NextHomeCatalogo/1.0 (levantamento de lancamentos em Barueri; contato: sq1matheusgsilva@gmail.com)";

/** Pausa entre páginas. Ninguém pediu, mas ler devagar é o mínimo. */
const PAUSA_MS = 1500;

const argv = process.argv.slice(2);
const arg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const TODOS = argv.includes("--todos");
const STATUS_ALVO = arg("status") ?? "Em construção";

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina(n) {
  const url = n === 1 ? BASE : `${BASE}?page=${n}`;
  const resposta = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`);

  const html = await resposta.text();
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
  );
  if (!m) throw new Error(`__NEXT_DATA__ não encontrado em ${url} — o site mudou de forma.`);

  const dados = JSON.parse(m[1]).props?.pageProps?.realties;
  if (!dados?.data) throw new Error(`payload sem 'realties.data' em ${url} — o site mudou de forma.`);
  return dados;
}

function enxugar(r) {
  return {
    nome: r.name,
    status: r.status?.name ?? "(sem status)",
    bairro: (r.neighborhoods ?? []).map((b) => b.name).join(", ") || "(sem bairro)",
    dormitorios: r.bedrooms ?? "",
    area: r.area ?? "",
    vagas: r.parking ?? "",
    precoAnunciado: r.price ?? "",
    link: r.permalink,
  };
}

const todos = [];
let n = 1;
let ultima = 1;

do {
  const pag = await pagina(n);
  ultima = pag.lastPage ?? 1;
  todos.push(...pag.data.map(enxugar));
  process.stderr.write(`  página ${n}/${ultima} — ${pag.data.length} imóveis\n`);
  n++;
  if (n <= ultima) await esperar(PAUSA_MS);
} while (n <= ultima);

const filtrados = TODOS ? todos : todos.filter((r) => r.status === STATUS_ALVO);

console.error(
  `\n${todos.length} imóveis em Barueri · ${filtrados.length} com status "${TODOS ? "todos" : STATUS_ALVO}"\n`,
);

const porStatus = {};
for (const r of todos) porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
console.error("distribuição por status:");
for (const [s, q] of Object.entries(porStatus).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(q).padStart(3)}  ${s}`);
}

// O JSON vai para o stdout: dá para redirecionar para arquivo sem sujar com log.
console.log(JSON.stringify(filtrados, null, 2));
