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
 * Saída: public/icones/icone-astroimob.svg e os PNG 180 (apple), 192, 512 e
 * 512 mascarável (fundo até a borda, selo dentro do círculo de 80%).
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
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
  [192, "astroimob-192.png", { raio: 14, escala: 0.95 }],
  [512, "astroimob-512.png", { raio: 14, escala: 0.95 }],
  [512, "astroimob-mascaravel-512.png", { raio: 0, escala: 0.75 }],
]) {
  await sharp(Buffer.from(svg(lado, opcoes))).png().toFile(join(saida, nome));
}
