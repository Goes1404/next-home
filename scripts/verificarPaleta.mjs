/**
 * Mede a paleta do CRM em vez de confiar no olho.
 *
 * Duas perguntas, e as duas já falharam neste projeto:
 *
 * 1. CONTRASTE. "Vibrante" é fácil de escrever e fácil de tornar ilegível —
 *    a migration 0052 deixou duas etapas com cor de tema escuro sobre fundo
 *    claro e ninguém viu por meses, porque build, tipo e teste passam.
 * 2. SEPARAÇÃO DE MATIZ. Color coding só serve se as cores forem
 *    distinguíveis de relance. Duas matizes a 15° de distância são a mesma
 *    cor para quem bate o olho — e são exatamente iguais para boa parte dos
 *    daltônicos.
 *
 * O valor medido é o que o NAVEGADOR pinta, não o que a conta promete: o CSS
 * real é compilado pelo Tailwind e lido com getComputedStyle nos dois temas.
 * É a única forma de pegar `light-dark()`, `color-mix()` e a cascata juntos.
 *
 *   node scripts/verificarPaleta.mjs
 */
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { chromium } from "@playwright/test";

const RAIZ = process.cwd();
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Mínimos da WCAG. Texto normal 4.5; alvo gráfico e texto grande 3.0. */
const AA_TEXTO = 4.5;
const AA_GRAFICO = 3;
/** Abaixo disso, duas matizes de módulo deixam de ser distinguíveis. */
const SEPARACAO_MINIMA = 40;
/**
 * Distância perceptual mínima entre dois passos VIZINHOS da rampa de etapa.
 *
 * Rampa troca distinção entre vizinhos por leitura de ordem, e esse é o
 * negócio que se fez ao substituir seis matizes soltas. Mas a razão de a 0052
 * ter criado uma cor por etapa continua valendo: "duas etapas com a mesma cor
 * não são identificáveis de relance". Este piso é onde o negócio para de
 * valer a pena — abaixo dele a rampa vira degradê e a etapa deixa de se ler
 * na régua de 4px.
 */
const PASSO_MINIMO = 0.075;

const MODULOS = ["inicio", "leads", "whatsapp", "imoveis", "conta", "admin"];
const ETAPAS = ["novo", "contato", "visita", "doc", "fechado", "perdido"];

// --- cor -------------------------------------------------------------------

/**
 * O Chromium devolve a cor no espaço em que ela foi escrita — `oklch(...)`,
 * não `rgb(...)`. Ler os três números como se fossem RGB dá lixo silencioso
 * (foi o primeiro estado deste script: todas as matizes deram 0° de
 * distância). Em vez de converter espaço de cor na mão, o navegador pinta
 * cada token sobre preto e sobre branco num canvas; desses dois valores saem
 * a cor sólida e o alfa, exatos, já em sRGB — que é o que a tela mostra.
 */
function daPintura({ preto, branco }) {
  const alfa = 1 - (branco[0] - preto[0] + (branco[1] - preto[1]) + (branco[2] - preto[2])) / (3 * 255);
  const a = Math.max(0, Math.min(1, alfa));
  if (a < 0.004) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: preto[0] / a, g: preto[1] / a, b: preto[2] / a, a };
}

/** Achata uma cor translúcida sobre o que está atrás dela. */
function compor(frente, fundo) {
  const a = frente.a;
  return {
    r: frente.r * a + fundo.r * (1 - a),
    g: frente.g * a + fundo.g * (1 - a),
    b: frente.b * a + fundo.b * (1 - a),
    a: 1,
  };
}

function luminancia({ r, g, b }) {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(frente, fundo) {
  const f = frente.a < 1 ? compor(frente, fundo) : frente;
  const [a, b] = [luminancia(f), luminancia(fundo)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** sRGB -> OKLab. Espaço perceptual: distância aqui corresponde ao que o olho vê. */
function oklab({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s2 = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2,
  };
}

/** Distância perceptual entre duas cores (ΔE OK). */
function distancia(c1, c2) {
  const x = oklab(c1);
  const y = oklab(c2);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

/** sRGB -> matiz, para falar de identidade de módulo. */
function matiz({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bo = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const graus = (Math.atan2(Bo, A) * 180) / Math.PI;
  return { graus: (graus + 360) % 360, croma: Math.hypot(A, Bo) };
}

function distanciaDeMatiz(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- coleta ----------------------------------------------------------------

/** Nomes de token que o probe precisa ler, virados em classes utilitárias. */
const TOKENS = [
  "fundo", "superficie", "elevado", "campo", "linha", "linha-forte",
  "titulo", "corpo", "apoio", "tenue", "sobre-cor",
  "acento", "acento-hover", "acento-suave", "acento-lavado", "acento-linha",
  "ok", "alerta", "perigo",
  ...ETAPAS.flatMap((e) => [`etapa-${e}`, `etapa-${e}-lavado`]),
];

/**
 * Prefere o CSS DE PRODUÇÃO quando ele existe.
 *
 * A compilação por postcss aqui embaixo não passa pelo Lightning CSS, que é
 * quem de fato entrega o CSS no ar — e ele TRANSFORMA o que interessa: rebaixa
 * `light-dark()` para um polyfill de duas `var()`. Conferir só o compilado de
 * desenvolvimento aprovaria uma paleta que quebra em produção, que é a classe
 * de defeito que este projeto mais repete.
 *
 * Rode `npx next build` antes para a checagem valer de verdade; sem build, ela
 * ainda serve para iterar, e diz em voz alta o que está medindo.
 */
function cssDeProducao() {
  const dir = path.join(RAIZ, ".next/static/chunks");
  if (!fs.existsSync(dir)) return null;
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".css"));
  if (arquivos.length === 0) return null;
  return arquivos.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
}

async function compilarCss() {
  const tw = (await import("@tailwindcss/postcss")).default;
  const entrada = path.join(RAIZ, ".tmp-paleta", "probe.css");
  fs.mkdirSync(path.dirname(entrada), { recursive: true });
  const classes = TOKENS.map((t) => `bg-${t}`).join(" ");
  fs.writeFileSync(
    entrada,
    `@import "./../src/app/globals.css" source(none);\n@source inline("${classes}");\n`,
  );
  const r = await postcss([tw({ base: RAIZ })]).process(fs.readFileSync(entrada, "utf8"), {
    from: entrada,
  });
  return r.css;
}

async function lerTema(css, { esquema, tema }) {
  const nav = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await nav.newContext({ colorScheme: esquema });
  const pg = await ctx.newPage();

  /*
   * A sonda pinta com `style="background-color: var(--color-x)"` e não com a
   * classe `bg-x`. É o que permite medir o CSS de PRODUÇÃO: lá o Tailwind só
   * gerou as utilities que o app de fato usa, então metade das classes deste
   * probe não existiria — e token sem classe lê como transparente, o que
   * reprovaria uma paleta perfeitamente boa. Além disso é mais direto: o que
   * está sob teste é o TOKEN, não a utility que o embrulha.
   */
  const pintar = (id, token) => `<i id="${id}" style="background-color: var(--color-${token})"></i>`;
  const sondas = TOKENS.map((t) => pintar(`t-${t}`, t)).join("");
  const porModulo = MODULOS.map(
    (m) =>
      `<div data-modulo="${m}">` +
      ["acento", "acento-hover", "acento-suave", "acento-lavado", "sobre-cor"]
        .map((t) => pintar(`m-${m}-${t}`, t))
        .join("") +
      `</div>`,
  ).join("");

  await pg.setContent(
    `<!doctype html><html${tema ? ` data-tema="${tema}"` : ""}><head><style>${css}</style></head>` +
      `<body><main data-rota="painel">${sondas}${porModulo}</main></body></html>`,
  );

  const cores = await pg.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const sobre = (cor, base) => {
      ctx.globalCompositeOperation = "copy";
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = "source-over";
      // Sentinela: fillStyle inválido é IGNORADO em silêncio pelo canvas, e o
      // token some sem erro. Marcamos com uma cor improvável para detectar.
      ctx.fillStyle = "#ff00ff";
      ctx.fillStyle = cor;
      if (ctx.fillStyle === "#ff00ff" && cor !== "#ff00ff") return null;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const saida = {};
    for (const el of document.querySelectorAll("i[id]")) {
      const cor = getComputedStyle(el).backgroundColor;
      const preto = sobre(cor, "#000");
      const branco = sobre(cor, "#fff");
      saida[el.id] = preto && branco ? { preto, branco, css: cor } : null;
    }
    return saida;
  });
  await nav.close();
  return cores;
}

// --- classes mortas --------------------------------------------------------

/**
 * Classe que o Tailwind não gerou é classe que não existe — e ele não avisa.
 *
 * Em Tailwind v4, `bg-chip` sem `--color-chip` declarado não vira erro: vira
 * NADA. O elemento simplesmente fica sem fundo, e ninguém repara enquanto a
 * cor faltante for sutil. Achado assim: `bg-chip` estava em quatro lugares do
 * painel, três deles no `<code>` que explica as variáveis da mensagem de
 * campanha, todos sem fundo desde sempre.
 *
 * A checagem não mantém lista de utilities válidas — isso envelheceria a cada
 * versão do Tailwind. Ela pergunta ao CSS COMPILADO se a classe existe, que é
 * a única fonte de verdade sobre o que foi gerado.
 */
function classesMortas(css) {
  const candidatas = new Set();
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const alvo = path.join(dir, e.name);
      if (e.isDirectory()) varrer(alvo);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
        const codigo = fs
          .readFileSync(alvo, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        for (const m of codigo.matchAll(
          // O `(?<![-\w])` impede casar no MEIO de outra classe: sem ele,
          // `align-text-bottom` era lido como `text-bottom`.
          /(?<![-\w])(bg|text|border|ring|fill|stroke|divide|outline|from|via|to|accent|caret|decoration)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![-\w])/g,
        )) {
          candidatas.add(`${m[1]}-${m[2]}`);
        }
      }
    }
  };
  varrer(path.join(RAIZ, "src/app/corretor"));

  const mortas = [];
  for (const classe of candidatas) {
    // Sem o ponto na frente: com variante, o seletor gerado é
    // `.hover\:bg-acento-hover:hover`, e procurar por `.bg-acento-hover`
    // acusaria de morta uma classe que existe e funciona.
    if (!css.includes(classe)) mortas.push(classe);
  }
  return mortas.sort();
}

// --- verificação -----------------------------------------------------------

const falhas = [];
const avisos = [];

function checar(nome, valor, minimo, { critico = true } = {}) {
  const passou = valor >= minimo;
  if (!passou) (critico ? falhas : avisos).push(`${nome}: ${valor.toFixed(2)}:1 (mínimo ${minimo})`);
  return `${passou ? "ok " : "FALHA"} ${valor.toFixed(2)}:1`;
}

async function principal() {
  const producao = cssDeProducao();
  const css = producao ?? (await compilarCss());
  console.log(
    producao
      ? "\x1b[2mmedindo o CSS de PRODUÇÃO (.next/static/chunks) — com Lightning CSS\x1b[0m"
      : "\x1b[33mmedindo o CSS compilado por postcss — rode `npx next build` para conferir o de produção\x1b[0m",
  );

  const temas = [
    { rotulo: "escuro", esquema: "dark", tema: null },
    { rotulo: "claro (sistema)", esquema: "light", tema: null },
    { rotulo: "claro (escolhido)", esquema: "dark", tema: "claro" },
  ];

  for (const t of temas) {
    const cru = await lerTema(css, t);
    const cor = (id) => {
      const bruto = cru[id];
      if (!bruto) throw new Error(`token não resolveu no navegador: ${id}`);
      return daPintura(bruto);
    };
    const superficie = cor("t-superficie");
    const fundo = cor("t-fundo");

    console.log(`\n\x1b[1m── tema ${t.rotulo} ─────────────────────────────\x1b[0m`);

    console.log("  texto sobre superfície");
    for (const [nome, min] of [["titulo", AA_TEXTO], ["corpo", AA_TEXTO], ["apoio", AA_TEXTO], ["tenue", AA_GRAFICO]]) {
      console.log(`    ${nome.padEnd(14)} ${checar(`${t.rotulo}/${nome} sobre superfície`, contraste(cor(`t-${nome}`), superficie), min)}`);
    }
    console.log(`    ${"linha".padEnd(14)} ${checar(`${t.rotulo}/linha sobre superfície`, contraste(cor("t-linha"), superficie), 1.2, { critico: false })}`);

    console.log("  módulo");
    const matizes = {};
    for (const m of MODULOS) {
      const acento = cor(`m-${m}-acento`);
      const sobre = cor(`m-${m}-sobre-cor`);
      const suave = cor(`m-${m}-acento-suave`);
      matizes[m] = matiz(acento);
      const botao = checar(`${t.rotulo}/${m} texto do botão`, contraste(sobre, acento), AA_TEXTO);
      const texto = checar(`${t.rotulo}/${m} acento-suave como texto`, contraste(suave, superficie), AA_TEXTO);
      const marca = checar(`${t.rotulo}/${m} acento como marca`, contraste(acento, fundo), AA_GRAFICO);
      console.log(`    ${m.padEnd(9)} botão ${botao}  texto ${texto}  marca ${marca}`);
    }

    console.log("  rampa: distância perceptual entre passos vizinhos (mínimo " + PASSO_MINIMO + ")");
    const RAMPA = ["novo", "contato", "visita", "doc"];
    for (let i = 0; i < RAMPA.length - 1; i++) {
      const d = distancia(cor(`t-etapa-${RAMPA[i]}`), cor(`t-etapa-${RAMPA[i + 1]}`));
      const passa = d >= PASSO_MINIMO;
      if (!passa) falhas.push(`${t.rotulo}/rampa ${RAMPA[i]}→${RAMPA[i + 1]}: ${d.toFixed(3)} (mínimo ${PASSO_MINIMO})`);
      console.log(`    ${(RAMPA[i] + " → " + RAMPA[i + 1]).padEnd(20)} ${passa ? "ok   " : "FALHA"} ${d.toFixed(3)}`);
    }

    console.log("  etapa (texto do chip sobre o próprio lavado)");
    for (const e of ETAPAS) {
      const tinta = cor(`t-etapa-${e}`);
      const chip = compor(cor(`t-etapa-${e}-lavado`), superficie);
      const min = e === "perdido" ? AA_GRAFICO : AA_TEXTO;
      console.log(`    ${e.padEnd(9)} ${checar(`${t.rotulo}/etapa ${e}`, contraste(tinta, chip), min)}`);
    }

    {
      // A separação é conferida em TODOS os temas, não só no escuro: os
      // valores de claro e escuro são independentes, e a primeira versão
      // deste script só olhava um deles — mexer no outro passava batido.
      console.log("  separação de matiz entre módulos (OKLCH, mínimo " + SEPARACAO_MINIMA + "°)");
      const cromaticos = MODULOS.filter((m) => matizes[m].croma > 0.04);
      for (let i = 0; i < cromaticos.length; i++) {
        for (let j = i + 1; j < cromaticos.length; j++) {
          const [a, b] = [cromaticos[i], cromaticos[j]];
          const d = distanciaDeMatiz(matizes[a].graus, matizes[b].graus);
          if (d < SEPARACAO_MINIMA) falhas.push(`${t.rotulo}/${a} × ${b}: ${d.toFixed(0)}° (mínimo ${SEPARACAO_MINIMA}°)`);
          console.log(`    ${(a + " × " + b).padEnd(22)} ${d < SEPARACAO_MINIMA ? "FALHA" : "ok   "} ${d.toFixed(0)}°`);
        }
      }
      const estados = { ok: matiz(cor("t-ok")), alerta: matiz(cor("t-alerta")), perigo: matiz(cor("t-perigo")) };
      console.log("  distância de cada módulo para a cor de estado mais próxima");
      for (const m of cromaticos) {
        const perto = Object.entries(estados)
          .map(([n, v]) => [n, distanciaDeMatiz(matizes[m].graus, v.graus)])
          .sort((x, y) => x[1] - y[1])[0];
        // 22° e não 25°: no tema claro o arco quente livre entre `perigo`
        // (17°) e `alerta` (66°) tem 49° no total, então o MÁXIMO que um
        // módulo quente pode alcançar ali é ~24,5°. Um limiar acima disso
        // seria inatingível por construção — e aviso que nunca apaga vira
        // paisagem, que é como um alerta deixa de ser lido.
        if (perto[1] < 22) avisos.push(`${t.rotulo}/${m} está a ${perto[1].toFixed(0)}° de "${perto[0]}"`);
        console.log(`    ${m.padEnd(9)} ${perto[0].padEnd(7)} ${perto[1].toFixed(0)}°`);
      }
    }
  }

  const mortas = classesMortas(css);
  console.log(`\n\x1b[1m── classes de cor que o Tailwind não gerou ──────────\x1b[0m`);
  if (mortas.length === 0) {
    console.log("  ok    nenhuma");
  } else {
    for (const c of mortas) {
      console.log(`  \x1b[31mFALHA\x1b[0m ${c}`);
      falhas.push(`classe morta: ${c} (nada é pintado — token não declarado?)`);
    }
  }

  console.log("");
  for (const a of avisos) console.log(`\x1b[33maviso\x1b[0m  ${a}`);
  for (const f of falhas) console.log(`\x1b[31mfalha\x1b[0m  ${f}`);

  if (falhas.length) {
    console.log(`\n\x1b[31m${falhas.length} falha(s).\x1b[0m A paleta não passa — ajuste antes de subir.`);
    process.exit(1);
  }
  console.log(`\n\x1b[32mPaleta aprovada.\x1b[0m ${avisos.length} aviso(s).`);
}

principal();
