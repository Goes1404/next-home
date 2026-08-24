/**
 * DESCARTÁVEL. Mede o que dá para extrair de PDFs reais de construtora,
 * para decidir se o parser caseiro basta ou se precisamos de mupdf wasm.
 *
 * Uso:  npx tsx scripts/medirPdfsDeConstrutora.ts caminho/da/pasta
 *
 * Não importa nada de src/ de propósito: roda antes de pdfImagens.ts
 * existir, e a varredura aqui é grosseira — quer contar, não extrair bem.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateSync, inflateRawSync } from "node:zlib";

function descomprimir(bruto: Buffer, dicionario: string): Buffer | null {
  if (!/\/FlateDecode/.test(dicionario)) return null;
  for (const inflar of [inflateSync, inflateRawSync]) {
    try {
      return inflar(bruto);
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}

function medir(pdf: Buffer) {
  const cru = pdf.toString("latin1");
  const porCodec = new Map<string, number>();
  const tamanhos: { l: number; a: number; codec: string }[] = [];
  let cursor = 0;

  for (;;) {
    const inicio = cru.indexOf("stream", cursor);
    if (inicio === -1) break;
    const fim = cru.indexOf("endstream", inicio);
    if (fim === -1) break;

    const abreDic = cru.lastIndexOf("<<", inicio);
    const dic = abreDic === -1 ? "" : cru.slice(abreDic, inicio);

    if (/\/Subtype\s*\/Image/.test(dic)) {
      const codec = dic.match(/\/Filter\s*\/?\[?\s*\/?(\w+)/)?.[1] ?? "sem-filtro";
      porCodec.set(codec, (porCodec.get(codec) ?? 0) + 1);
      const l = Number(dic.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
      const a = Number(dic.match(/\/Height\s+(\d+)/)?.[1] ?? 0);
      tamanhos.push({ l, a, codec });

      // Confere se o Flate realmente descomprime (bitmap cru costuma dar certo).
      if (codec === "FlateDecode") {
        let dados = inicio + "stream".length;
        if (cru[dados] === "\r") dados++;
        if (cru[dados] === "\n") dados++;
        if (!descomprimir(pdf.subarray(dados, fim), dic)) {
          porCodec.set("FlateDecode-ilegivel", (porCodec.get("FlateDecode-ilegivel") ?? 0) + 1);
        }
      }
    }

    cursor = fim + "endstream".length;
  }

  const paginas = (cru.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const uteis = tamanhos.filter((t) => t.l >= 800 && t.a >= 600);
  return { porCodec, tamanhos, paginas, uteis };
}

async function main() {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error("Uso: npx tsx scripts/medirPdfsDeConstrutora.ts <pasta com PDFs>");
    process.exit(1);
  }

  const nomes = (await readdir(pasta)).filter((n) => n.toLowerCase().endsWith(".pdf"));
  if (nomes.length === 0) {
    console.log(`Nenhum PDF em ${pasta}.`);
    return;
  }

  for (const nome of nomes) {
    const pdf = await readFile(join(pasta, nome));
    const { porCodec, tamanhos, paginas, uteis } = medir(pdf);

    console.log(`\n=== ${nome} — ${(pdf.length / 1_000_000).toFixed(1)} MB, ${paginas} páginas`);
    console.log(`    imagens embutidas: ${tamanhos.length}`);
    for (const [codec, n] of porCodec) console.log(`      ${codec}: ${n}`);
    console.log(`    grandes o bastante para vitrine (>=800x600): ${uteis.length}`);

    // O sinal do deck "chapado": uma imagem enorme por página, na proporção da página.
    const umaPorPagina = paginas > 0 && Math.abs(tamanhos.length - paginas) <= 1;
    console.log(`    parece deck chapado (1 imagem por página): ${umaPorPagina ? "SIM" : "não"}`);
    console.log(
      `    5 maiores: ${[...tamanhos]
        .sort((x, y) => y.l * y.a - x.l * x.a)
        .slice(0, 5)
        .map((t) => `${t.l}x${t.a}/${t.codec}`)
        .join(", ")}`,
    );
  }
}

void main();
