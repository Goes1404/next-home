/**
 * Gera o ícone da plataforma, Astro Soluções (28/10/2026; antes AstroImob):
 * usado na aba e no atalho de quem está no painel de um grupo SEM logo, no
 * login de astroimob.vercel.app e em /plataforma.
 * Uso: node scripts/marca/gerarIconeAstroimob.mjs
 *
 * Um ladrilho azul-marinho com o selo da Astro: um "A" aberto, a órbita que
 * o cruza e uma estrela de quatro pontas. É o mesmo desenho de
 * `src/components/marca/SeloAstro.tsx`. Os nomes dos arquivos continuam
 * `astroimob-*` para não mexer em quem já instalou o atalho.
 * Saída: public/icones/icone-astroimob.svg e os PNG 120/152/167/180 (iOS),
 * 192, 512 e 512 mascarável (fundo até a borda, selo dentro do círculo de
 * 80%), e as telas de abertura do iOS em public/icones/abertura/.
 */
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const saida = join(process.cwd(), "public/icones");

/** O selo num quadro de 64 unidades; `escala` encolhe em volta do centro. */
const selo = (escala) =>
  `<g transform="translate(32 32) scale(${escala}) translate(-32 -32)">` +
  `<path d="M18 48 L32 15 L46 48" fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<ellipse cx="32" cy="37" rx="24" ry="7.5" transform="rotate(-18 32 37)" fill="none" stroke="#a9c1e0" stroke-width="2.6"/>` +
  `<path d="M49 15 L50.6 19.4 L55 21 L50.6 22.6 L49 27 L47.4 22.6 L43 21 L47.4 19.4 Z" fill="#fff"/>` +
  `</g>`;

const svg = (lado, { raio, escala }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${lado}" height="${lado}">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3a6b"/><stop offset="1" stop-color="#0a1830"/></linearGradient></defs>` +
  `<rect width="64" height="64" rx="${raio}" fill="url(#g)"/>` +
  selo(escala) +
  `</svg>`;

writeFileSync(join(saida, "icone-astroimob.svg"), svg(64, { raio: 14, escala: 1 }));
for (const [lado, nome, opcoes] of [
  [180, "astroimob-180.png", { raio: 0, escala: 0.95 }], // iPhone pinta o transparente de preto: sem cantos
  // Os outros tamanhos do iOS (29/10/2026): iPhone 120, iPad 152 e 167.
  [120, "astroimob-120.png", { raio: 0, escala: 0.95 }],
  [152, "astroimob-152.png", { raio: 0, escala: 0.95 }],
  [167, "astroimob-167.png", { raio: 0, escala: 0.95 }],
  [192, "astroimob-192.png", { raio: 14, escala: 0.95 }],
  [512, "astroimob-512.png", { raio: 14, escala: 0.95 }],
  [512, "astroimob-mascaravel-512.png", { raio: 0, escala: 0.75 }],
]) {
  await sharp(Buffer.from(svg(lado, opcoes))).png().toFile(join(saida, nome));
}

/*
 * As telas de abertura do iPhone e do iPad (29/10/2026). O iOS não monta o
 * splash pelo manifesto: sem uma imagem do tamanho exato da tela, o app
 * instalado abre num branco. Fundo marinho da abertura (#08132a, o mesmo do
 * Android) com o brilho azul e o selo no centro. A lista de telas é a mesma
 * dos metadados (`src/lib/marcaDoCrm/telasDeAbertura.json`).
 * Saída: public/icones/abertura/astro-<largura>x<altura>.png (pixels).
 */
const telas = JSON.parse(readFileSync(join(process.cwd(), "src/lib/marcaDoCrm/telasDeAbertura.json"), "utf8"));
const pastaDaAbertura = join(saida, "abertura");
mkdirSync(pastaDaAbertura, { recursive: true });

const abertura = (w, h) => {
  const lado = Math.round(Math.min(w, h) * 0.26);
  const x = Math.round((w - lado) / 2);
  const y = Math.round((h - lado) / 2 - h * 0.04);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><radialGradient id="brilho" cx="50%" cy="44%" r="60%"><stop offset="0" stop-color="#2f5ea8" stop-opacity=".45"/><stop offset=".7" stop-color="#2f5ea8" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="#08132a"/><rect width="${w}" height="${h}" fill="url(#brilho)"/>` +
    `<svg x="${x}" y="${y}" width="${lado}" height="${lado}" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3a6b"/><stop offset="1" stop-color="#0a1830"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="14" fill="url(#g)" stroke="rgba(169,193,224,.3)" stroke-width=".6"/>` +
    selo(1) +
    `</svg></svg>`
  );
};

for (const t of telas) {
  const w = t.largura * t.escala;
  const h = t.altura * t.escala;
  await sharp(Buffer.from(abertura(w, h)))
    .png({ palette: true, colors: 128, dither: 1, compressionLevel: 9 })
    .toFile(join(pastaDaAbertura, `astro-${w}x${h}.png`));
}
