/**
 * F0 da reestruturação da geração de imagem — a medição que decide a Onda 2.
 *
 * ## Por que fala com a API direto, e não por `gerarImagem`
 *
 * `gerarImagem.ts` manda UMA imagem (`image`). A pergunta que decide a
 * arquitetura é justamente quanto custa mandar DUAS (`image[]`), e medir isso
 * pelo caminho de produção seria medir o que já sabemos. Aqui a chamada é
 * crua, com multipart montado à mão — é medição, não produção.
 *
 * ## As três perguntas
 *
 * 1. LATÊNCIA com 1 e com 2 referências, em `low` e `medium`. A doc oficial
 *    admite até 2 MINUTOS em prompt complexo; a função da Vercel morre em 60s
 *    e o teto interno de `gerarImagem` é 45s. Se estourar, o caminho com duas
 *    imagens vai para o worker — porque estourar significa matar a função com
 *    a imagem JÁ PAGA.
 * 2. Quanto do ESTILO transfere de uma peça-modelo.
 * 3. A taxa de acerto do TEXTO LITERAL com a técnica documentada (aspas +
 *    soletrar), contra a linha de base medida nesta base: 3 em 4.
 *
 * O timeout é de 150s DE PROPÓSITO — acima dos 45s de produção. Aqui se mede o
 * estouro; cortar em 45 esconderia exatamente o número que interessa.
 *
 * Uso:
 *   set -a; . ./.env.local; set +a
 *   npx tsx scripts/imagens/medirF0.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = "scripts/imagens/f0";
const URL_GERAR = "https://api.openai.com/v1/images/generations";
const URL_EDITAR = "https://api.openai.com/v1/images/edits";
const MODELO = "gpt-image-2";
const TIMEOUT_MS = 150_000;

/** A mesma cláusula de produção: o que o modelo não pode inventar na cena. */
const SEM_TEXTO =
  "Não escreva nada na imagem: sem texto, letras, números, placas, letreiros, " +
  "logotipos, marcas, selos de preço ou marca d'água.";

const CENA =
  "Fachada de um edifício residencial alto em Barueri, vista da calçada em leve " +
  "contra-plongée, fim de tarde com luz quente e rasante, concreto claro e vidro " +
  "refletivo, paisagismo tropical no térreo, fotografia arquitetônica.";

type Caso = {
  nome: string;
  prompt: string;
  qualidade: "low" | "medium";
  referencias: string[];
  altura: number;
};

const CASOS: Caso[] = [
  { nome: "1ref-low", prompt: `${CENA} ${SEM_TEXTO}`, qualidade: "low", referencias: [`${BASE}/fachada.jpg`], altura: 1536 },
  { nome: "1ref-medium", prompt: `${CENA} ${SEM_TEXTO}`, qualidade: "medium", referencias: [`${BASE}/fachada.jpg`], altura: 1536 },
  {
    nome: "2ref-low",
    prompt:
      `Entrada 1: o SUJEITO — o edifício que deve aparecer. Entrada 2: o ESTILO — ` +
      `copie dela a paleta, o clima de luz e o tipo de composição. ${CENA} ${SEM_TEXTO}`,
    qualidade: "low",
    referencias: [`${BASE}/fachada.jpg`, `${BASE}/segunda.jpg`],
    altura: 1536,
  },
  {
    nome: "2ref-medium",
    prompt:
      `Entrada 1: o SUJEITO — o edifício que deve aparecer. Entrada 2: o ESTILO — ` +
      `copie dela a paleta, o clima de luz e o tipo de composição. ${CENA} ${SEM_TEXTO}`,
    qualidade: "medium",
    referencias: [`${BASE}/fachada.jpg`, `${BASE}/segunda.jpg`],
    altura: 1536,
  },
  {
    nome: "texto-literal-1",
    prompt:
      'Peça vertical de lançamento imobiliário sobre uma fachada de prédio ao entardecer. ' +
      'A ÚNICA escrita da imagem é "MUDE AINDA ESTE ANO", soletrado ' +
      "M-U-D-E A-I-N-D-A E-S-T-E A-N-O, em caixa alta, no terço superior esquerdo, " +
      "tipografia sem serifa pesada. Nenhuma outra palavra, placa, letreiro ou logotipo.",
    qualidade: "low",
    referencias: [],
    altura: 1536,
  },
  {
    nome: "texto-literal-2",
    prompt:
      "Peça quadrada de imobiliária sobre a foto de uma piscina de condomínio. " +
      'A ÚNICA escrita da imagem é "PRONTO PARA MORAR", soletrado ' +
      "P-R-O-N-T-O P-A-R-A M-O-R-A-R, em caixa alta, numa faixa horizontal amarela " +
      "atravessando o terço inferior, tipografia sem serifa. Nenhuma outra palavra.",
    qualidade: "low",
    referencias: [],
    altura: 1024,
  },
];

function chave(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY ausente. Rode: set -a; . ./.env.local; set +a");
  return k;
}

function blob(caminho: string): Blob {
  const bytes = readFileSync(caminho);
  const mime = caminho.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Blob([new Uint8Array(bytes)], { type: mime });
}

type Saida = { ok: true; bytes: Buffer; latenciaMs: number } | { ok: false; erro: string; latenciaMs: number };

async function gerar(caso: Caso): Promise<Saida> {
  const inicio = Date.now();
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), TIMEOUT_MS);
  const tamanho = `1024x${caso.altura}`;

  try {
    let resposta: Response;

    if (caso.referencias.length > 0) {
      const forma = new FormData();
      forma.append("model", MODELO);
      forma.append("prompt", caso.prompt);
      forma.append("size", tamanho);
      forma.append("quality", caso.qualidade);
      forma.append("n", "1");
      // `image[]` — o parser aceita múltiplas (sondado em 10/09, custo zero).
      for (const [i, ref] of caso.referencias.entries()) forma.append("image[]", blob(ref), `entrada-${i + 1}.jpg`);

      resposta = await fetch(URL_EDITAR, {
        method: "POST",
        headers: { Authorization: `Bearer ${chave()}` },
        body: forma,
        signal: controle.signal,
      });
    } else {
      resposta = await fetch(URL_GERAR, {
        method: "POST",
        headers: { Authorization: `Bearer ${chave()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODELO,
          prompt: caso.prompt,
          size: tamanho,
          quality: caso.qualidade,
          n: 1,
        }),
        signal: controle.signal,
      });
    }

    const latenciaMs = Date.now() - inicio;
    const corpo = await resposta.text();

    if (!resposta.ok) {
      let msg = corpo.slice(0, 200);
      try {
        msg = (JSON.parse(corpo) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        /* corpo não-JSON: fica o recorte cru */
      }
      return { ok: false, erro: `HTTP ${resposta.status}: ${msg}`, latenciaMs };
    }

    const json = JSON.parse(corpo) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return { ok: false, erro: "resposta sem imagem", latenciaMs };

    return { ok: true, bytes: Buffer.from(b64, "base64"), latenciaMs };
  } catch (err) {
    const latenciaMs = Date.now() - inicio;
    const abortou = err instanceof Error && err.name === "AbortError";
    return { ok: false, erro: abortou ? `timeout em ${TIMEOUT_MS} ms` : String(err), latenciaMs };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const linhas: string[] = [];
  mkdirSync("docs/medicoes", { recursive: true });

  for (const caso of CASOS) {
    if (caso.referencias.some((r) => !existsSync(r))) {
      console.log(`[${caso.nome}] PULADO — falta ${caso.referencias.find((r) => !existsSync(r))}`);
      linhas.push(`| ${caso.nome} | ${caso.referencias.length} | ${caso.qualidade} | — | pulado (falta imagem de entrada) |`);
      continue;
    }

    const r = await gerar(caso);
    const seg = (r.latenciaMs / 1000).toFixed(1);
    const status = r.ok ? "ok" : `falhou — ${r.erro}`;
    const teto = r.latenciaMs > 45_000 ? " ⚠️ ACIMA do teto de 45 s" : "";

    linhas.push(`| ${caso.nome} | ${caso.referencias.length} | ${caso.qualidade} | ${seg} s${teto} | ${status} |`);
    console.log(linhas.at(-1));

    if (r.ok) writeFileSync(`${BASE}/saida-${caso.nome}.png`, r.bytes);
  }

  const doc = [
    "# F0 — geração de imagem, medição de 2026-09-10",
    "",
    "Feita com a API crua (não por `gerarImagem`), porque a pergunta é sobre",
    "`image[]` com DUAS entradas e o caminho de produção só manda uma.",
    "",
    "| caso | referências | qualidade | latência | resultado |",
    "|---|---|---|---|---|",
    ...linhas,
    "",
    "## O que decide a Onda 2",
    "",
    "- Teto interno de `gerarImagem`: **45 s**. Teto da função no plano Hobby: **60 s**.",
    "- Se `2ref-medium` passou de 45 s, o caminho com duas referências vai para o",
    "  worker do GitHub Actions (o mesmo do vídeo) em vez de responder na hora.",
    "",
    "## Texto literal",
    "",
    "Conferir À VISTA `saida-texto-literal-*.png`: a escrita bate caractere por",
    "caractere? Linha de base sem a técnica de aspas + soletrar: **3 acertos em 4**.",
  ].join("\n");

  writeFileSync("docs/medicoes/2026-09-10-f0-imagem.md", doc);
  console.log("\nEscrito em docs/medicoes/2026-09-10-f0-imagem.md");
}

void main();
