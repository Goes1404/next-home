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

/** sRGB -> OKLab, só para poder falar de matiz em espaço perceptual. */
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

  const sondas = TOKENS.map((t) => `<i id="t-${t}" class="bg-${t}"></i>`).join("");
  const porModulo = MODULOS.map(
    (m) =>
      `<div data-modulo="${m}">` +
      ["acento", "acento-hover", "acento-suave", "acento-lavado", "sobre-cor"]
        .map((t) => `<i id="m-${m}-${t}" class="bg-${t}"></i>`)
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

// --- verificação -----------------------------------------------------------

const falhas = [];
const avisos = [];

function checar(nome, valor, minimo, { critico = true } = {}) {
  const passou = valor >= minimo;
  if (!passou) (critico ? falhas : avisos).push(`${nome}: ${valor.toFixed(2)}:1 (mínimo ${minimo})`);
  return `${passou ? "ok " : "FALHA"} ${valor.toFixed(2)}:1`;
}

async function principal() {
  const css = await compilarCss();

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
