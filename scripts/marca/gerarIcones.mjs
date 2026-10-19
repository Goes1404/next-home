/**
 * Gera os ícones do site (aba do navegador, resultado do Google e tela
 * inicial do celular) a partir do símbolo da marca, sem o nome escrito: em
 * 16 ou 32 pixels o nome não se lê.
 *
 * Uso: node scripts/marca/gerarIcones.mjs [simbolo.png]
 * Padrão: scripts/marca/simbolo.png, o símbolo da Next Home (prédios e
 * casa) em #00594F com fundo transparente, recortado da logo em 09/10/2026.
 *
 * Saídas, nos nomes que o Next lê sozinho em src/app/:
 * - favicon.ico com 16, 32 e 48 px (PNG dentro do ICO);
 * - icon.png 192x192, múltiplo de 48 como o Google pede para o ícone do
 *   resultado de busca;
 * - apple-icon.png 180x180 opaco, porque o iPhone pinta de preto o que for
 *   transparente.
 *
 * E em public/, para o atalho da tela inicial (lidos pelo manifest.ts):
 * - icones/icone-512.png, o mesmo ladrilho do icon.png em 512 px;
 * - icones/icone-mascaravel-512.png, branco até a borda e com o símbolo
 *   dentro do círculo de 80% que o Android garante mostrar. O celular recorta
 *   o ícone no formato dele (círculo, gota, quadrado); sem esta versão, o
 *   Android encolhe o ícone dentro de um quadrado branco;
 * - apple-touch-icon.png e apple-touch-icon-precomposed.png, cópias do
 *   apple-icon.png no caminho que alguns navegadores e robôs pedem sem ler
 *   o <head>. Sem eles, recebiam a página de erro.
 *
 * O símbolo vai sobre um quadrado BRANCO de cantos arredondados. A casa da
 * logo é desenhada pelo espaço em branco: com fundo transparente, na aba
 * escura do navegador a casa some e o verde quase não aparece.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const simbolo = process.argv[2] ?? join(raiz, "scripts/marca/simbolo.png");
const app = join(raiz, "src/app");
const publico = join(raiz, "public");

/** Quadrado branco com o símbolo no meio. */
async function ladrilho(lado, { margem, raio, opaco = false }) {
  const interno = Math.round(lado * (1 - 2 * margem));
  const marca = await sharp(simbolo)
    .resize(interno, interno, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
  const r = Math.round(lado * raio);
  const fundo = opaco
    ? sharp({ create: { width: lado, height: lado, channels: 4, background: "#ffffff" } })
    : sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}">` +
            `<rect width="${lado}" height="${lado}" rx="${r}" ry="${r}" fill="#ffffff"/></svg>`,
        ),
      );
  const pos = Math.round((lado - interno) / 2);
  return fundo
    .composite([{ input: marca, left: pos, top: pos }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO com as imagens em PNG (aceito por todo navegador atual). */
function ico(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);
  const diretorio = Buffer.alloc(16 * imagens.length);
  let deslocamento = 6 + 16 * imagens.length;
  imagens.forEach(({ lado, dados }, i) => {
    const o = i * 16;
    diretorio.writeUInt8(lado >= 256 ? 0 : lado, o);
    diretorio.writeUInt8(lado >= 256 ? 0 : lado, o + 1);
    diretorio.writeUInt16LE(1, o + 4);
    diretorio.writeUInt16LE(32, o + 6);
    diretorio.writeUInt32LE(dados.length, o + 8);
    diretorio.writeUInt32LE(deslocamento, o + 12);
    deslocamento += dados.length;
  });
  return Buffer.concat([cabecalho, diretorio, ...imagens.map((im) => im.dados)]);
}

const daAba = [];
for (const lado of [16, 32, 48]) {
  daAba.push({ lado, dados: await ladrilho(lado, { margem: 0.06, raio: 0.2 }) });
}
writeFileSync(join(app, "favicon.ico"), ico(daAba));
writeFileSync(join(app, "icon.png"), await ladrilho(192, { margem: 0.12, raio: 0.22 }));
const daApple = await ladrilho(180, { margem: 0.14, raio: 0, opaco: true });
writeFileSync(join(app, "apple-icon.png"), daApple);
console.log("Ícones gravados em src/app: favicon.ico (16/32/48), icon.png (192), apple-icon.png (180).");

mkdirSync(join(publico, "icones"), { recursive: true });
writeFileSync(join(publico, "icones/icone-512.png"), await ladrilho(512, { margem: 0.12, raio: 0.22 }));
// Margem de 22%: o símbolo ocupa 56% do lado, e o canto dele fica a
// 0,28 x raiz de 2 = 39,6% do centro, dentro do círculo de 40% de raio.
writeFileSync(
  join(publico, "icones/icone-mascaravel-512.png"),
  await ladrilho(512, { margem: 0.22, raio: 0, opaco: true }),
);
writeFileSync(join(publico, "apple-touch-icon.png"), daApple);
writeFileSync(join(publico, "apple-touch-icon-precomposed.png"), daApple);
console.log(
  "Ícones gravados em public: icones/icone-512.png, icones/icone-mascaravel-512.png, apple-touch-icon(-precomposed).png.",
);
