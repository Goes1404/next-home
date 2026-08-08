/**
 * Gera os `blur_data_url` de cada imagem em /public e imprime o SQL de update.
 * As imagens já estão no Supabase Storage; a fonte local serve só de original.
 */
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const RAIZ = new URL("../public/empreendimentos", import.meta.url).pathname;
const BASE_STORAGE =
  "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos";

async function* arquivos(dir) {
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) yield* arquivos(caminho);
    else if (/\.(jpe?g|png|webp)$/i.test(entrada.name)) yield caminho;
  }
}

for await (const caminho of arquivos(RAIZ)) {
  // 12px de largura: o Next amplia e desfoca, então mais que isso é peso morto.
  const buf = await sharp(caminho).resize(12).webp({ quality: 45 }).toBuffer();
  const dataUrl = `data:image/webp;base64,${buf.toString("base64")}`;
  const url = `${BASE_STORAGE}/${relative(RAIZ, caminho)}`;
  console.log(
    `update midias set blur_data_url = '${dataUrl}' where url = '${url}';`,
  );
}
