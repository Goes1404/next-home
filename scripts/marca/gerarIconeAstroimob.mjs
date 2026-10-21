/**
 * Gera o ícone da AstroImob (a plataforma): usado na aba e no atalho de quem
 * está no painel de um grupo SEM logo, no login de astroimob.vercel.app e em
 * /plataforma. Uso: node scripts/marca/gerarIconeAstroimob.mjs
 *
 * Um ladrilho violeta com uma estrela de quatro pontas (o "astro"), desenhado
 * em SVG: public/icones/icone-astroimob.svg e os PNG 180 (apple), 192, 512 e
 * 512 mascarável (fundo até a borda, estrela dentro do círculo de 80%).
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const saida = join(process.cwd(), "public/icones");
const estrela = (c, r) => {
  const i = r * 0.28;
  return `M${c} ${c - r} L${c + i} ${c - i} L${c + r} ${c} L${c + i} ${c + i} L${c} ${c + r} L${c - i} ${c + i} L${c - r} ${c} L${c - i} ${c - i} Z`;
};
const svg = (lado, { raio, estrelaR }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado}" height="${lado}">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>` +
  `<rect width="${lado}" height="${lado}" rx="${raio}" fill="url(#g)"/>` +
  `<path d="${estrela(lado / 2, estrelaR)}" fill="#fff"/></svg>`;

writeFileSync(join(saida, "icone-astroimob.svg"), svg(64, { raio: 14, estrelaR: 22 }));
for (const [lado, nome, opcoes] of [
  [180, "astroimob-180.png", { raio: 0, estrelaR: 0.34 }], // iPhone pinta o transparente de preto: sem cantos
  [192, "astroimob-192.png", { raio: 0.22, estrelaR: 0.34 }],
  [512, "astroimob-512.png", { raio: 0.22, estrelaR: 0.34 }],
  [512, "astroimob-mascaravel-512.png", { raio: 0, estrelaR: 0.3 }],
]) {
  const s = svg(lado, { raio: Math.round(lado * opcoes.raio), estrelaR: Math.round(lado * opcoes.estrelaR) });
  await sharp(Buffer.from(s)).png().toFile(join(saida, nome));
}
