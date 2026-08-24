# Ingestão de material do empreendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar fotos, plantas e dados de um empreendimento de dentro de um PDF de apresentação e de uma pasta aberta do Google Drive, e colocá-los no cadastro depois de uma curadoria humana.

**Architecture:** Extração determinística de imagens do PDF com `node:zlib` puro (irmão do `pdfTexto.ts` que já existe), derivadas (medida, blur, preview) pelo `sharp`, listagem do Drive por API key no servidor, e uma tela de curadoria por onde tudo passa antes de virar linha em `midias`. Transferência é um arquivo por chamada de server action, com o cliente orquestrando — o teto de função no plano Hobby é 60s.

**Tech Stack:** Next 16.2.12 (App Router, Server Actions), React 19.2.4, TypeScript, Supabase (Postgres + Storage), `sharp` 0.35, Vitest 4, Node 22.

**Spec:** `docs/superpowers/specs/2026-08-24-ingestao-de-midia-design.md`

## Global Constraints

- **Este não é o Next.js que você conhece.** Antes de escrever código de framework, ler o guia relevante em `node_modules/next/dist/docs/` (regra de `AGENTS.md`).
- **Teto de 60s por função** (plano Hobby da Vercel). Nenhuma operação pode depender de processar uma pasta ou um deck inteiro num único request.
- **A IA não fala valores** (regra de negócio). Nenhum campo de preço no rascunho extraído por IA.
- **Deploy de verdade vai para DUAS branches**: `main` e `claude/modernizar-plataforma-imobiliaria-2tm13q` (a branch de produção da Vercel é a segunda — ver `docs/MEMORIA.md`).
- **Migration da Supabase roda em transação**: nada de `create index concurrently`.
- **Coluna nova editável pelo painel precisa de `grant update` explícito** quando a tabela tem `revoke update` (padrão que `leads` segue desde a 0007). Conferir `midias` antes de assumir.
- **Toda mensagem de tela em português de gente**, sem vocabulário de implementação ("cota", "fila", "instância", "stream").
- Rodar teste: `npx vitest run <arquivo>`. Rodar tudo: `npm test`. Lint: `npm run lint`.
- Nenhum erro engolido em silêncio: toda falha vira frase na tela ou item nomeado na lista.

---

## File Structure

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `scripts/medirPdfsDeConstrutora.ts` | F0 — descartável. Mede PDFs reais e imprime o que dá para extrair. |
| `src/lib/imoveis/pdfImagens.ts` | Extrai imagens embutidas de um PDF. Puro, sem I/O. |
| `src/lib/imoveis/pdfImagens.test.ts` | Testes com PDFs sintéticos montados no próprio teste. |
| `src/lib/imoveis/imagemDerivada.ts` | `sharp`: medida, blur, preview, palpite foto/planta. |
| `src/lib/imoveis/imagemDerivada.test.ts` | Testes das derivadas. |
| `src/lib/imoveis/registrarMidia.ts` | Único caminho de insert em `midias`. Recebe dependências, então é testável. |
| `src/lib/imoveis/registrarMidia.test.ts` | Testes com Supabase falso. |
| `src/lib/imoveis/drive.ts` | Link, listagem e download do Google Drive. |
| `src/lib/imoveis/drive.test.ts` | Testes de `parsearLinkDrive` e do filtro de arquivos. |
| `src/lib/imoveis/rascunhoDePdf.ts` | Texto do PDF → cascata de IA → rascunho de cadastro. |
| `src/lib/imoveis/rascunhoDePdf.test.ts` | Contrato do JSON e recusa de campo de preço. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/page.tsx` | Rota da tela de importação. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts` | Server actions da importação. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/ImportarClient.tsx` | Casca da tela: escolhe a origem. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemPdf.tsx` | Aba PDF. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemDrive.tsx` | Aba Drive. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/GradeCuradoria.tsx` | Grade compartilhada pelas duas origens. |
| `src/app/corretor/(painel)/imoveis/[slug]/importar/RascunhoCadastro.tsx` | Campos sugeridos pela IA, um a um. |
| `supabase/migrations/0042_midias_hash.sql` | `hash_conteudo` + índice único parcial + grants. |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `package.json` | `sharp` sobe de `devDependencies` para `dependencies`. |
| `src/app/corretor/(painel)/imoveis/actions.ts` | `uploadFotoOuPlanta` passa a delegar para `registrarMidia`. |
| `src/lib/supabase/types.ts` | `midias` ganha `hash_conteudo` em Row/Insert/Update. |
| `src/app/corretor/(painel)/imoveis/[slug]/page.tsx` | Botão "Importar material". |
| `docs/MEMORIA.md` | O que esta reforma ensinou. |

**Por que a tela é quebrada em quatro componentes:** `WhatsappManager` (957 linhas) e `CampanhasManager` (552) já custaram uma fase inteira de refatoração (F4 do Painel de Bolso, 0049). A tela de importação nasce dividida por assunto para não repetir a história.

---

### Task 1: F0 — script que mede os PDFs reais

O script existe para responder uma pergunta com número: o parser caseiro dá conta dos decks que a construtora manda, ou vai ser preciso `mupdf` wasm para renderizar página? É descartável de propósito — não vira produto, não ganha teste.

**Files:**
- Create: `scripts/medirPdfsDeConstrutora.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada de código. Produz a decisão que a Task 2 assume (parser caseiro basta).

- [ ] **Step 1: Escrever o script**

```ts
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
      /* tenta o próximo */
    }
  }
  return null;
}

function medir(pdf: Buffer) {
  const cru = pdf.toString("latin1");
  const porCodec = new Map<string, number>();
  const tamanhos: { l: number; a: number; codec: string }[] = [];
  let cursor = 0;

  while (true) {
    const inicio = cru.indexOf("stream", cursor);
    if (inicio === -1) break;
    const fim = cru.indexOf("endstream", inicio);
    if (fim === -1) break;

    const abreDic = cru.lastIndexOf("<<", inicio);
    const dic = abreDic === -1 ? "" : cru.slice(abreDic, inicio);

    if (/\/Subtype\s*\/Image/.test(dic)) {
      const codec = dic.match(/\/Filter\s*\/?(\w+)/)?.[1] ?? "sem-filtro";
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

const pasta = process.argv[2];
if (!pasta) {
  console.error("Uso: npx tsx scripts/medirPdfsDeConstrutora.ts <pasta com PDFs>");
  process.exit(1);
}

for (const nome of (await readdir(pasta)).filter((n) => n.toLowerCase().endsWith(".pdf"))) {
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
    `    5 maiores: ${[...tamanhos].sort((x, y) => y.l * y.a - x.l * x.a).slice(0, 5).map((t) => `${t.l}x${t.a}/${t.codec}`).join(", ")}`,
  );
}
```

- [ ] **Step 2: Rodar contra um PDF qualquer para provar que o script não quebra**

Run: `npx tsx scripts/medirPdfsDeConstrutora.ts .` (numa pasta sem PDF ele não imprime nada e sai com 0 — isso é passar)
Expected: sem exceção.

- [ ] **Step 3: Commit**

```bash
git add scripts/medirPdfsDeConstrutora.ts
git commit -m "chore: script descartável que mede o que dá para extrair de PDFs de construtora"
```

- [ ] **Step 4: Pedir os PDFs reais e rodar**

Mensagem para o dono do produto: "me dá 3-5 PDFs de apresentação de construtora numa pasta". Rodar o script sobre eles e **colar a saída no PR/issue**. Decisão que sai daí:
- Se a maioria das imagens é `DCTDecode` e há várias por página → **parser caseiro basta**, seguir o plano como está.
- Se aparece "parece deck chapado: SIM" na maioria → abrir tarefa nova para `mupdf` wasm (renderizar página), **fora deste plano**.

---

### Task 2: `pdfImagens.ts` — extrair as imagens JPEG embutidas

**Files:**
- Create: `src/lib/imoveis/pdfImagens.ts`
- Test: `src/lib/imoveis/pdfImagens.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: `extrairImagensDePdf(pdf: Buffer | Uint8Array): ResultadoImagensPdf`, com `ImagemExtraida = { bytes: Buffer; mime: "image/jpeg" | "image/png"; largura: number; altura: number; pagina: number | null; parecePaginaInteira: boolean }` e `ResultadoImagensPdf = { imagens: ImagemExtraida[]; naoSuportadas: { codec: string; quantidade: number }[]; descartadasPorTamanho: number }`. Usado pelas Tasks 8 e 10.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/imoveis/pdfImagens.test.ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extrairImagensDePdf } from "./pdfImagens";

/** PDF mínimo com um XObject de imagem JPEG embutido. */
function pdfComJpeg(jpeg: Buffer, largura: number, altura: number): Buffer {
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura}` +
    ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n`;
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n${dicionario}stream\n`, "latin1"),
    jpeg,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

async function jpegDeTeste(largura: number, altura: number): Promise<Buffer> {
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer();
}

describe("extrairImagensDePdf — JPEG embutido", () => {
  it("devolve os bytes do JPEG sem recodificar, com as dimensões do dicionário", async () => {
    const jpeg = await jpegDeTeste(640, 480);
    const resultado = extrairImagensDePdf(pdfComJpeg(jpeg, 640, 480));

    expect(resultado.imagens).toHaveLength(1);
    expect(resultado.imagens[0].mime).toBe("image/jpeg");
    expect(resultado.imagens[0].largura).toBe(640);
    expect(resultado.imagens[0].altura).toBe(480);
    // Sem recodificar: os bytes são idênticos aos que entraram.
    expect(resultado.imagens[0].bytes.equals(jpeg)).toBe(true);
  });

  it("descarta imagem pequena demais para ser foto (ícone, logo)", async () => {
    const jpeg = await jpegDeTeste(80, 80);
    const resultado = extrairImagensDePdf(pdfComJpeg(jpeg, 80, 80));

    expect(resultado.imagens).toHaveLength(0);
    expect(resultado.descartadasPorTamanho).toBe(1);
  });

  it("devolve vazio para arquivo que não é PDF, sem lançar", () => {
    const resultado = extrairImagensDePdf(Buffer.from("isto não é um pdf"));
    expect(resultado.imagens).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/pdfImagens.test.ts`
Expected: FAIL — `Failed to resolve import "./pdfImagens"`.

- [ ] **Step 3: Implementar o mínimo**

```ts
// src/lib/imoveis/pdfImagens.ts
/**
 * Extrai as imagens embutidas de um PDF sem dependência externa.
 *
 * Irmão de `src/lib/leads/pdfTexto.ts`, e a varredura é a mesma: cada
 * `stream ... endstream` do arquivo é precedido do dicionário que diz o que
 * ele é. Lá o filtro era "tem operador de texto?"; aqui é
 * `/Subtype /Image`.
 *
 * O caso que mais importa é o `/DCTDecode`: nele os bytes do stream JÁ SÃO
 * um JPEG completo. Copiar cru preserva a resolução original do arquivo que
 * a construtora entregou — o deck exibe a foto reduzida na página, mas o
 * arquivo embutido costuma ser bem maior que isso.
 */

/** Menor que isto é ícone, logo ou fio de rodapé — não é foto de imóvel. */
const LADO_MINIMO = 200;

/** Deck de 80 páginas não pode virar 80 mídias. */
export const TETO_IMAGENS = 60;

export type ImagemExtraida = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  largura: number;
  altura: number;
  /** Número da página em que aparece, quando determinável. */
  pagina: number | null;
  /** Proporção bate com a da página: provável página chapada (Canva). */
  parecePaginaInteira: boolean;
};

export type ResultadoImagensPdf = {
  imagens: ImagemExtraida[];
  /** Vistas mas não lidas. Some em silêncio seria pior que não achar. */
  naoSuportadas: { codec: string; quantidade: number }[];
  descartadasPorTamanho: number;
};

function numeroDoDicionario(dicionario: string, chave: string): number | null {
  const achado = dicionario.match(new RegExp(`/${chave}\\s+(\\d+)`));
  return achado ? Number(achado[1]) : null;
}

function codecDoDicionario(dicionario: string): string {
  const achado = dicionario.match(/\/Filter\s*\/?\[?\s*\/?(\w+)/);
  return achado ? achado[1] : "sem-filtro";
}

export function extrairImagensDePdf(pdf: Buffer | Uint8Array): ResultadoImagensPdf {
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const cru = bytes.toString("latin1");

  const imagens: ImagemExtraida[] = [];
  const naoLidos = new Map<string, number>();
  let descartadasPorTamanho = 0;

  if (!cru.startsWith("%PDF")) {
    return { imagens, naoSuportadas: [], descartadasPorTamanho };
  }

  let cursor = 0;
  while (imagens.length < TETO_IMAGENS) {
    const inicioStream = cru.indexOf("stream", cursor);
    if (inicioStream === -1) break;
    const fimStream = cru.indexOf("endstream", inicioStream);
    if (fimStream === -1) break;

    const abreDicionario = cru.lastIndexOf("<<", inicioStream);
    const dicionario = abreDicionario === -1 ? "" : cru.slice(abreDicionario, inicioStream);
    cursor = fimStream + "endstream".length;

    if (!/\/Subtype\s*\/Image/.test(dicionario)) continue;

    const largura = numeroDoDicionario(dicionario, "Width");
    const altura = numeroDoDicionario(dicionario, "Height");
    if (!largura || !altura) continue;

    if (largura < LADO_MINIMO || altura < LADO_MINIMO) {
      descartadasPorTamanho++;
      continue;
    }

    const codec = codecDoDicionario(dicionario);
    if (codec !== "DCTDecode") {
      naoLidos.set(codec, (naoLidos.get(codec) ?? 0) + 1);
      continue;
    }

    let inicioDados = inicioStream + "stream".length;
    if (cru[inicioDados] === "\r") inicioDados++;
    if (cru[inicioDados] === "\n") inicioDados++;

    // O `endstream` vem depois de uma quebra de linha que NÃO faz parte do
    // JPEG. Sem recortar, os bytes saem com lixo no fim e o `sharp` reclama.
    let fimDados = fimStream;
    if (cru[fimDados - 1] === "\n") fimDados--;
    if (cru[fimDados - 1] === "\r") fimDados--;

    imagens.push({
      bytes: bytes.subarray(inicioDados, fimDados),
      mime: "image/jpeg",
      largura,
      altura,
      pagina: null,
      parecePaginaInteira: false,
    });
  }

  return {
    imagens,
    naoSuportadas: [...naoLidos].map(([codec, quantidade]) => ({ codec, quantidade })),
    descartadasPorTamanho,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/pdfImagens.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/imoveis/pdfImagens.ts src/lib/imoveis/pdfImagens.test.ts
git commit -m "feat: extrai as imagens JPEG embutidas de um PDF, sem dependência nova"
```

---

### Task 3: bitmap `FlateDecode` vira PNG, e codec desconhecido é contado

Deck feito em ferramenta que exporta bitmap cru não traz JPEG nenhum. Sem este passo, esses PDFs devolvem zero imagem e parecem "não ter foto".

**Files:**
- Modify: `src/lib/imoveis/pdfImagens.ts`
- Test: `src/lib/imoveis/pdfImagens.test.ts`

**Interfaces:**
- Consumes: `extrairImagensDePdf` da Task 2.
- Produces: a mesma assinatura; agora `mime` também pode ser `"image/png"`, e `naoSuportadas` fica preenchido.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// acrescentar em src/lib/imoveis/pdfImagens.test.ts
import { deflateSync } from "node:zlib";

/** PDF com bitmap RGB cru comprimido em Flate (sem JPEG no meio). */
function pdfComBitmapFlate(largura: number, altura: number): Buffer {
  const pixels = Buffer.alloc(largura * altura * 3, 0x80);
  const comprimido = deflateSync(pixels);
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura}` +
    ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${comprimido.length} >>\n`;
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n${dicionario}stream\n`, "latin1"),
    comprimido,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

/** PDF com imagem em codec que não sabemos ler. */
function pdfComJpx(largura: number, altura: number): Buffer {
  const conteudo = Buffer.alloc(5000, 0x11);
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura}` +
    ` /Filter /JPXDecode /Length ${conteudo.length} >>\n`;
  return Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n${dicionario}stream\n`, "latin1"),
    conteudo,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

describe("extrairImagensDePdf — bitmap cru e codec desconhecido", () => {
  it("remonta um PNG legível a partir de bitmap RGB comprimido em Flate", async () => {
    const resultado = extrairImagensDePdf(pdfComBitmapFlate(300, 240));

    expect(resultado.imagens).toHaveLength(1);
    expect(resultado.imagens[0].mime).toBe("image/png");

    // Prova de que o PNG remontado é válido: o sharp lê e confere as medidas.
    const meta = await sharp(resultado.imagens[0].bytes).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(240);
  });

  it("conta o codec que não sabe ler em vez de sumir com a imagem", () => {
    const resultado = extrairImagensDePdf(pdfComJpx(1200, 800));

    expect(resultado.imagens).toHaveLength(0);
    expect(resultado.naoSuportadas).toEqual([{ codec: "JPXDecode", quantidade: 1 }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/pdfImagens.test.ts`
Expected: FAIL — o primeiro teste devolve 0 imagens (Flate cai em `naoSuportadas` hoje).

- [ ] **Step 3: Implementar**

```ts
// acrescentar em src/lib/imoveis/pdfImagens.ts
import { deflateSync, inflateSync, inflateRawSync } from "node:zlib";

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (const byte of dados) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunkPng(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/**
 * Bitmap cru (o que sai do Flate) não é um arquivo de imagem — é só a
 * sequência de pixels. Vira PNG acrescentando o byte de filtro por linha e
 * comprimindo de novo. Custa uma recompressão, mas evita uma dependência de
 * codificador de imagem só para este caso.
 */
function montarPng(pixels: Buffer, largura: number, altura: number, canais: 1 | 3): Buffer | null {
  const bytesPorLinha = largura * canais;
  if (pixels.length < bytesPorLinha * altura) return null;

  const comFiltro = Buffer.alloc((bytesPorLinha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    const destino = y * (bytesPorLinha + 1);
    comFiltro[destino] = 0; // filtro "None"
    pixels.copy(comFiltro, destino + 1, y * bytesPorLinha, (y + 1) * bytesPorLinha);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = canais === 1 ? 0 : 2; // 0 = cinza, 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng("IHDR", ihdr),
    chunkPng("IDAT", deflateSync(comFiltro)),
    chunkPng("IEND", Buffer.alloc(0)),
  ]);
}

function descomprimirFlate(bruto: Buffer): Buffer | null {
  for (const inflar of [inflateSync, inflateRawSync]) {
    try {
      return inflar(bruto);
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}
```

E, dentro do laço de `extrairImagensDePdf`, trocar o bloco que hoje descarta tudo que não é `DCTDecode`:

```ts
    let inicioDados = inicioStream + "stream".length;
    if (cru[inicioDados] === "\r") inicioDados++;
    if (cru[inicioDados] === "\n") inicioDados++;
    let fimDados = fimStream;
    if (cru[fimDados - 1] === "\n") fimDados--;
    if (cru[fimDados - 1] === "\r") fimDados--;
    const dados = bytes.subarray(inicioDados, fimDados);

    if (codec === "DCTDecode") {
      imagens.push({ bytes: dados, mime: "image/jpeg", largura, altura, pagina: null, parecePaginaInteira: false });
      continue;
    }

    if (codec === "FlateDecode") {
      // Só bitmap de 8 bits em cinza ou RGB. Paleta indexada e máscara
      // precisariam do dicionário de cores; são raras em deck e viram
      // "não suportado" em vez de saírem com a cor errada.
      const bits = numeroDoDicionario(dicionario, "BitsPerComponent");
      const canais = /\/DeviceRGB/.test(dicionario) ? 3 : /\/DeviceGray/.test(dicionario) ? 1 : null;
      const pixels = bits === 8 && canais ? descomprimirFlate(dados) : null;
      const png = pixels && canais ? montarPng(pixels, largura, altura, canais) : null;

      if (png) {
        imagens.push({ bytes: png, mime: "image/png", largura, altura, pagina: null, parecePaginaInteira: false });
      } else {
        naoLidos.set("FlateDecode", (naoLidos.get("FlateDecode") ?? 0) + 1);
      }
      continue;
    }

    naoLidos.set(codec, (naoLidos.get(codec) ?? 0) + 1);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/pdfImagens.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/imoveis/pdfImagens.ts src/lib/imoveis/pdfImagens.test.ts
git commit -m "feat: bitmap cru do PDF vira PNG, e codec ilegível é contado em vez de sumir"
```

---

### Task 4: marcar a imagem que é a página inteira

O deck feito no Canva costuma ter uma imagem por página, do tamanho da página, com logo e texto por cima. Extrair não é errado — mas apresentar isso como "foto do empreendimento" sem avisar é.

**Files:**
- Modify: `src/lib/imoveis/pdfImagens.ts`
- Test: `src/lib/imoveis/pdfImagens.test.ts`

**Interfaces:**
- Consumes: `extrairImagensDePdf`.
- Produces: `parecePaginaInteira` deixa de ser sempre `false`. A Task 9 mostra esse aviso na grade.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// acrescentar em src/lib/imoveis/pdfImagens.test.ts
describe("extrairImagensDePdf — página chapada", () => {
  it("marca a imagem cuja proporção bate com a da página", async () => {
    // A4 paisagem no MediaBox: 842 x 595 pontos ≈ 1,415.
    // A imagem 2000x1414 tem a MESMA proporção: é a página inteira.
    const jpeg = await jpegDeTeste(2000, 1414);
    const dicionario =
      `<< /Type /XObject /Subtype /Image /Width 2000 /Height 1414` +
      ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n`;
    const pdf = Buffer.concat([
      Buffer.from(
        `%PDF-1.7\n1 0 obj\n<< /Type /Page /MediaBox [0 0 842 595] >>\nendobj\n2 0 obj\n${dicionario}stream\n`,
        "latin1",
      ),
      jpeg,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);

    const resultado = extrairImagensDePdf(pdf);
    expect(resultado.imagens[0].parecePaginaInteira).toBe(true);
  });

  it("não marca foto de proporção diferente da página", async () => {
    const jpeg = await jpegDeTeste(1000, 1000);
    const dicionario =
      `<< /Type /XObject /Subtype /Image /Width 1000 /Height 1000` +
      ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\n`;
    const pdf = Buffer.concat([
      Buffer.from(
        `%PDF-1.7\n1 0 obj\n<< /Type /Page /MediaBox [0 0 842 595] >>\nendobj\n2 0 obj\n${dicionario}stream\n`,
        "latin1",
      ),
      jpeg,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);

    expect(extrairImagensDePdf(pdf).imagens[0].parecePaginaInteira).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/pdfImagens.test.ts`
Expected: FAIL no primeiro (`false` em vez de `true`).

- [ ] **Step 3: Implementar**

```ts
// em src/lib/imoveis/pdfImagens.ts, antes de extrairImagensDePdf
/**
 * Proporção da primeira página do PDF. Serve de régua para desconfiar de
 * imagem que é a página inteira. Uma página só basta: deck tem formato
 * único, e ler todas custaria varrer o arquivo de novo.
 */
function proporcaoDaPagina(cru: string): number | null {
  const caixa = cru.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!caixa) return null;
  const largura = Number(caixa[3]) - Number(caixa[1]);
  const altura = Number(caixa[4]) - Number(caixa[2]);
  if (!(largura > 0) || !(altura > 0)) return null;
  return largura / altura;
}
```

No corpo de `extrairImagensDePdf`, calcular uma vez antes do laço e usar nos dois `push`:

```ts
  const proporcaoPagina = proporcaoDaPagina(cru);

  // ...dentro do laço, no lugar de `parecePaginaInteira: false`:
  const parecePaginaInteira =
    proporcaoPagina !== null && Math.abs(largura / altura - proporcaoPagina) < 0.03;
```

(Os dois `push` — JPEG e PNG — passam a receber `parecePaginaInteira`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/pdfImagens.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/imoveis/pdfImagens.ts src/lib/imoveis/pdfImagens.test.ts
git commit -m "feat: marca a imagem que é a página inteira do deck, para a curadoria avisar"
```

---

### Task 5: `imagemDerivada.ts` — medida, blur, preview e palpite de planta

**Files:**
- Create: `src/lib/imoveis/imagemDerivada.ts`
- Test: `src/lib/imoveis/imagemDerivada.test.ts`
- Modify: `package.json` (mover `sharp` para `dependencies`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `medirImagem(bytes: Buffer): Promise<{ largura: number; altura: number } | null>`
  - `gerarBlur(bytes: Buffer): Promise<string | null>`
  - `gerarPreview(bytes: Buffer): Promise<{ dataUrl: string; parecePlanta: boolean } | null>`
  Usados pelas Tasks 7, 8, 10 e 13.

- [ ] **Step 1: Mover `sharp` para `dependencies`**

```bash
npm pkg delete devDependencies.sharp
npm pkg set dependencies.sharp="^0.35.3"
npm install
```

Por que: `sharp` só era usado por `scripts/gerar-blur.mjs`, que roda na máquina de quem desenvolve. A partir daqui ele roda **em produção**, dentro de server action — e dependência de runtime em `devDependencies` não vai para o build da Vercel.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/lib/imoveis/imagemDerivada.test.ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { gerarBlur, gerarPreview, medirImagem } from "./imagemDerivada";

function imagemLisa(largura: number, altura: number, cor: { r: number; g: number; b: number }) {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: cor } })
    .jpeg()
    .toBuffer();
}

describe("medirImagem", () => {
  it("devolve as medidas reais do arquivo", async () => {
    const medida = await medirImagem(await imagemLisa(800, 533, { r: 10, g: 90, b: 160 }));
    expect(medida).toEqual({ largura: 800, altura: 533 });
  });

  it("devolve null para bytes que não são imagem, sem lançar", async () => {
    expect(await medirImagem(Buffer.from("nada disso"))).toBeNull();
  });
});

describe("gerarBlur", () => {
  it("devolve um data URL de WebP minúsculo", async () => {
    const blur = await gerarBlur(await imagemLisa(1600, 900, { r: 10, g: 90, b: 160 }));
    expect(blur).toMatch(/^data:image\/webp;base64,/);
    // O placeholder viaja em TODA página de vitrine: precisa ser pequeno.
    expect(blur!.length).toBeLessThan(2000);
  });
});

describe("gerarPreview", () => {
  it("acha que imagem clara e sem cor é planta", async () => {
    const previa = await gerarPreview(await imagemLisa(1200, 900, { r: 246, g: 246, b: 244 }));
    expect(previa!.parecePlanta).toBe(true);
  });

  it("não acha que foto colorida é planta", async () => {
    const previa = await gerarPreview(await imagemLisa(1200, 900, { r: 30, g: 110, b: 180 }));
    expect(previa!.parecePlanta).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/imagemDerivada.test.ts`
Expected: FAIL — `Failed to resolve import "./imagemDerivada"`.

- [ ] **Step 4: Implementar**

```ts
// src/lib/imoveis/imagemDerivada.ts
import sharp from "sharp";

/**
 * Tudo que se tira de uma imagem depois de decodificá-la uma vez: a medida
 * real, o placeholder borrado da vitrine, e a prévia pequena da curadoria.
 *
 * As três moram juntas porque nascem da mesma decodificação, e porque a
 * receita do blur não é escolha nova: `scripts/gerar-blur.mjs` já produzia
 * exatamente 12px em WebP q45 para as fotos que estão no ar. Mudar o
 * tamanho aqui faria as fotos novas terem placeholder diferente das antigas.
 */

export async function medirImagem(bytes: Buffer): Promise<{ largura: number; altura: number } | null> {
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    return { largura: meta.width, altura: meta.height };
  } catch {
    return null;
  }
}

export async function gerarBlur(bytes: Buffer): Promise<string | null> {
  try {
    const miniatura = await sharp(bytes).resize(12).webp({ quality: 45 }).toBuffer();
    return `data:image/webp;base64,${miniatura.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Planta é clara e quase sem cor; foto de fachada ou decorado não é nem uma
 * coisa nem outra. É um palpite para PRÉ-marcar a grade de curadoria — quem
 * decide é o corretor. Feito com `stats()` em vez de IA de visão porque a
 * cota gratuita do Gemini é de 20 chamadas por dia e é a mesma que atende
 * cliente no WhatsApp.
 */
export async function gerarPreview(bytes: Buffer): Promise<{ dataUrl: string; parecePlanta: boolean } | null> {
  try {
    const imagem = sharp(bytes);
    const [previa, stats] = await Promise.all([
      imagem.clone().resize(400).webp({ quality: 60 }).toBuffer(),
      imagem.clone().stats(),
    ]);

    const medias = stats.channels.slice(0, 3).map((canal) => canal.mean);
    const clara = medias.every((m) => m > 225);
    const semCor = Math.max(...medias) - Math.min(...medias) < 12;

    return {
      dataUrl: `data:image/webp;base64,${previa.toString("base64")}`,
      parecePlanta: clara && semCor,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/imagemDerivada.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/imoveis/imagemDerivada.ts src/lib/imoveis/imagemDerivada.test.ts
git commit -m "feat: derivadas de imagem pelo sharp (medida, blur, prévia) e sharp vira dependência de runtime"
```

---

### Task 6: migration `0042` — hash de conteúdo em `midias`

**Files:**
- Create: `supabase/migrations/0042_midias_hash.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `midias.hash_conteudo text`, usada pela Task 7.

- [ ] **Step 1: Conferir o estado real do banco antes de escrever a migration**

A tabela de migrations da Supabase está dessincronizada do schema real (ver `docs/MEMORIA.md`) — nunca confiar em `list_migrations`. Conferir por SQL:

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'midias';

select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'midias';
```

Se `hash_conteudo` já existir, parar e reavaliar. Se `midias` **não** tiver `revoke update` (isto é, se `authenticated` já tiver update na tabela toda), o `grant` do Step 2 é inócuo — mantenha-o mesmo assim, documentado no comentário.

- [ ] **Step 2: Escrever a migration**

```sql
-- Dedup de mídia por conteúdo (ingestão de PDF e Drive).
--
-- A construtora manda o MESMO material por dois caminhos: o PDF de
-- apresentação e a pasta do Drive. Sem uma identidade de conteúdo, a foto
-- da fachada entra duas vezes na galeria e o cliente recebe a mesma imagem
-- duas vezes por WhatsApp.
--
-- O hash é sha256 dos bytes do arquivo, calculado antes do upload. Ele
-- também é o que torna a importação RETOMÁVEL: rodar de novo depois de uma
-- queda não duplica o que já entrou.
--
-- Índice PARCIAL (`where hash_conteudo is not null`) porque as 53 mídias
-- que já existem no banco nasceram antes disto e nunca serão re-hasheadas —
-- um índice único total recusaria a segunda delas.

alter table public.midias add column if not exists hash_conteudo text;

create unique index if not exists midias_dedup_idx
  on public.midias (empreendimento_id, hash_conteudo)
  where hash_conteudo is not null;

comment on column public.midias.hash_conteudo is
  'sha256 dos bytes do arquivo. Dedup entre PDF e Drive, e retomada da importação.';

-- Coluna nova precisa de grant explícito quando a tabela tem revoke update:
-- sem ele a policy passa, o update afeta zero linhas, e não há erro nenhum.
grant update (hash_conteudo, largura, altura, blur_data_url) on public.midias to authenticated;
```

- [ ] **Step 3: Aplicar em produção e conferir**

Aplicar via MCP da Supabase (`apply_migration`, projeto `prhhrqyubjcafvucirri`). Conferir:

```sql
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='midias' and column_name='hash_conteudo';
```
Expected: uma linha, `text`.

- [ ] **Step 4: Refletir a coluna nos tipos**

Em `src/lib/supabase/types.ts`, no bloco `midias`, acrescentar `hash_conteudo: string | null` em `Row` e `hash_conteudo?: string | null` em `Insert` e `Update` (ordem alfabética, como o resto do arquivo).

- [ ] **Step 5: Provar que compila**

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0042_midias_hash.sql src/lib/supabase/types.ts
git commit -m "feat: hash de conteúdo em midias, para dedup entre PDF e Drive e importação retomável"
```

---

### Task 7: `registrarMidia` — um único caminho de gravação, com a medida certa

Esta tarefa conserta, sozinha, duas coisas erradas em **toda** foto que já subiu: a dimensão chumbada e o blur nulo.

**Files:**
- Create: `src/lib/imoveis/registrarMidia.ts`
- Test: `src/lib/imoveis/registrarMidia.test.ts`
- Modify: `src/app/corretor/(painel)/imoveis/actions.ts:118-174` (`uploadFotoOuPlanta`)

**Interfaces:**
- Consumes: `medirImagem`, `gerarBlur` (Task 5); coluna `hash_conteudo` (Task 6).
- Produces:
  ```ts
  type DepsMidia = {
    subir(caminho: string, bytes: Buffer, contentType: string): Promise<{ erro: string | null }>;
    urlPublica(caminho: string): string;
    inserir(linha: LinhaMidiaNova): Promise<{ id: string | null; duplicada: boolean; erro: string | null }>;
  };
  registrarMidia(deps: DepsMidia, entrada: EntradaMidia): Promise<ResultadoRegistro>;
  ```
  `EntradaMidia = { empreendimentoId: string; bytes: Buffer; mime: string; tipo: "foto" | "planta"; alt: string; ordem?: number }`;
  `ResultadoRegistro = { ok: true; id: string | null; duplicada: boolean; url: string } | { ok: false; erro: string }`.
  Usado pelas Tasks 8, 10 e 13.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/imoveis/registrarMidia.test.ts
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { registrarMidia, type DepsMidia } from "./registrarMidia";

async function fotoDeTeste(largura = 1600, altura = 900) {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 20, g: 100, b: 160 } } })
    .jpeg()
    .toBuffer();
}

function depsFalsas() {
  const inseridas: any[] = [];
  const deps: DepsMidia = {
    subir: vi.fn(async () => ({ erro: null })),
    urlPublica: (caminho) => `https://storage.exemplo/${caminho}`,
    inserir: vi.fn(async (linha) => {
      const jaTem = inseridas.some(
        (l) => l.hash_conteudo === linha.hash_conteudo && l.empreendimento_id === linha.empreendimento_id,
      );
      if (jaTem) return { id: null, duplicada: true, erro: null };
      inseridas.push(linha);
      return { id: `id-${inseridas.length}`, duplicada: false, erro: null };
    }),
  };
  return { deps, inseridas };
}

describe("registrarMidia", () => {
  it("grava a medida REAL do arquivo, não 1920x1080", async () => {
    const { deps, inseridas } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(1200, 1200),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    expect(inseridas[0].largura).toBe(1200);
    expect(inseridas[0].altura).toBe(1200);
  });

  it("grava o blur, que hoje nunca é preenchido por caminho nenhum", async () => {
    const { deps, inseridas } = depsFalsas();

    await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: await fotoDeTeste(),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Fachada",
    });

    expect(inseridas[0].blur_data_url).toMatch(/^data:image\/webp;base64,/);
  });

  it("a mesma foto vinda duas vezes grava uma linha só", async () => {
    const { deps, inseridas } = depsFalsas();
    const bytes = await fotoDeTeste();

    const primeira = await registrarMidia(deps, {
      empreendimentoId: "emp-1", bytes, mime: "image/jpeg", tipo: "foto", alt: "Fachada",
    });
    const segunda = await registrarMidia(deps, {
      empreendimentoId: "emp-1", bytes, mime: "image/jpeg", tipo: "foto", alt: "Fachada de novo",
    });

    expect(primeira).toMatchObject({ ok: true, duplicada: false });
    expect(segunda).toMatchObject({ ok: true, duplicada: true });
    expect(inseridas).toHaveLength(1);
  });

  it("aceita arquivo que o sharp não lê, com medida nula em vez de recusar", async () => {
    const { deps, inseridas } = depsFalsas();

    const resultado = await registrarMidia(deps, {
      empreendimentoId: "emp-1",
      bytes: Buffer.from("isto não é uma imagem"),
      mime: "image/jpeg",
      tipo: "foto",
      alt: "Sei lá",
    });

    expect(resultado.ok).toBe(true);
    expect(inseridas[0].largura).toBeNull();
    expect(inseridas[0].blur_data_url).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/registrarMidia.test.ts`
Expected: FAIL — `Failed to resolve import "./registrarMidia"`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/imoveis/registrarMidia.ts
import { createHash } from "node:crypto";
import { gerarBlur, medirImagem } from "./imagemDerivada";

/**
 * Único caminho de gravação de mídia de empreendimento — upload avulso do
 * editor, imagem tirada do PDF e arquivo trazido do Drive passam todos
 * por aqui.
 *
 * Existe porque o insert que havia antes gravava `largura: 1920, altura:
 * 1080` CHUMBADOS e nunca preenchia `blur_data_url`. Os dois campos são
 * lidos por oito componentes da vitrine: a dimensão errada faz o layout
 * saltar quando a imagem chega, e o blur nulo dá flash branco em toda foto
 * do site. Com três caminhos de entrada, o insert espalhado repetiria o
 * erro em três lugares.
 *
 * As dependências entram por parâmetro para o teste rodar sem Supabase.
 */

export type LinhaMidiaNova = {
  empreendimento_id: string;
  tipo: "foto" | "planta";
  url: string;
  alt: string;
  largura: number | null;
  altura: number | null;
  blur_data_url: string | null;
  ordem: number;
  hash_conteudo: string;
};

export type DepsMidia = {
  subir(caminho: string, bytes: Buffer, contentType: string): Promise<{ erro: string | null }>;
  urlPublica(caminho: string): string;
  /** `duplicada` = o índice único de (empreendimento, hash) recusou. */
  inserir(linha: LinhaMidiaNova): Promise<{ id: string | null; duplicada: boolean; erro: string | null }>;
};

export type EntradaMidia = {
  empreendimentoId: string;
  bytes: Buffer;
  mime: string;
  tipo: "foto" | "planta";
  alt: string;
  ordem?: number;
};

export type ResultadoRegistro =
  | { ok: true; id: string | null; duplicada: boolean; url: string }
  | { ok: false; erro: string };

function extensaoDe(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function registrarMidia(deps: DepsMidia, entrada: EntradaMidia): Promise<ResultadoRegistro> {
  const hash = createHash("sha256").update(entrada.bytes).digest("hex");

  // Medida e blur não impedem a foto de entrar: arquivo exótico entra com
  // os campos nulos, que é exatamente o estado de tudo que já está no ar.
  const [medida, blur] = await Promise.all([medirImagem(entrada.bytes), gerarBlur(entrada.bytes)]);

  // O hash no nome do arquivo faz o upload ser idempotente: reenviar o mesmo
  // conteúdo escreve por cima do mesmo caminho, em vez de encher o bucket.
  const caminho = `empreendimentos/${entrada.empreendimentoId}/${entrada.tipo}-${hash.slice(0, 16)}.${extensaoDe(entrada.mime)}`;

  const upload = await deps.subir(caminho, entrada.bytes, entrada.mime);
  if (upload.erro) {
    return { ok: false, erro: "Não consegui enviar o arquivo. Tente de novo." };
  }

  const url = deps.urlPublica(caminho);
  const insercao = await deps.inserir({
    empreendimento_id: entrada.empreendimentoId,
    tipo: entrada.tipo,
    url,
    alt: entrada.alt.trim(),
    largura: medida?.largura ?? null,
    altura: medida?.altura ?? null,
    blur_data_url: blur,
    ordem: entrada.ordem ?? 10,
    hash_conteudo: hash,
  });

  if (insercao.erro) {
    return { ok: false, erro: "O arquivo subiu, mas não consegui registrar no catálogo." };
  }

  return { ok: true, id: insercao.id, duplicada: insercao.duplicada, url };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/registrarMidia.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Ligar o `uploadFotoOuPlanta` existente no caminho novo**

Em `src/app/corretor/(painel)/imoveis/actions.ts`, substituir o corpo de `uploadFotoOuPlanta` depois da validação do arquivo:

```ts
  const supabase = await createClient();
  const bytes = Buffer.from(await arquivo.arrayBuffer());

  const resultado = await registrarMidia(
    {
      async subir(caminho, conteudo, contentType) {
        const { error } = await supabase.storage
          .from("empreendimentos")
          .upload(caminho, conteudo, { contentType, upsert: true });
        return { erro: error?.message ?? null };
      },
      urlPublica(caminho) {
        return supabase.storage.from("empreendimentos").getPublicUrl(caminho).data.publicUrl;
      },
      async inserir(linha) {
        const { data, error } = await supabase.from("midias").insert(linha).select("id").single();
        // 23505 = unique_violation: o índice de dedup recusou, e isso é sucesso.
        if (error?.code === "23505") return { id: null, duplicada: true, erro: null };
        if (error) {
          console.error("Erro ao registrar mídia:", error);
          return { id: null, duplicada: false, erro: error.message };
        }
        return { id: data.id, duplicada: false, erro: null };
      },
    },
    {
      empreendimentoId,
      bytes,
      mime: arquivo.type || "image/jpeg",
      tipo: tipo === "planta" ? "planta" : "foto",
      alt,
    },
  );

  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  revalidatePath(`/empreendimentos/${slug}`);
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, midia: { id: resultado.id, url: resultado.url, tipo, alt } };
```

Importar no topo: `import { registrarMidia } from "@/lib/imoveis/registrarMidia";`

**Nota para quem implementa:** as três funções acima (`subir`/`urlPublica`/`inserir`) reaparecem nas Tasks 10 e 13. Extraia-as para `depsMidiaSupabase(supabase)` em `src/lib/imoveis/registrarMidia.ts` no momento em que a segunda cópia for necessária — não antes.

- [ ] **Step 6: Provar que o editor continua funcionando**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: sem erro; suíte inteira verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/imoveis/registrarMidia.ts src/lib/imoveis/registrarMidia.test.ts "src/app/corretor/(painel)/imoveis/actions.ts"
git commit -m "fix: mídia passa a gravar dimensão real e blur, por um caminho único"
```

---

### Task 8: staging do PDF e extração como server action

**Files:**
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts`

**Interfaces:**
- Consumes: `extrairImagensDePdf` (Tasks 2-4), `gerarPreview` (Task 5).
- Produces:
  ```ts
  analisarPdf(empreendimentoId: string, formData: FormData): Promise<AnaliseDoPdf>
  type ItemCurado = { indice: number; preview: string; largura: number; altura: number; parecePlanta: boolean; parecePaginaInteira: boolean };
  type AnaliseDoPdf =
    | { ok: true; caminhoStaging: string; itens: ItemCurado[]; avisos: string[] }
    | { ok: false; erro: string };
  ```
  Consumido pelas Tasks 9 e 10.

- [ ] **Step 1: Escrever a action**

```ts
// src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { extrairImagensDePdf, TETO_IMAGENS } from "@/lib/imoveis/pdfImagens";
import { gerarPreview } from "@/lib/imoveis/imagemDerivada";

/** Deck maior que isto não é apresentação: é catálogo inteiro da construtora. */
const TETO_PDF_BYTES = 25 * 1024 * 1024;

export type ItemCurado = {
  /** Posição na extração. A extração é determinística, então isto é identidade. */
  indice: number;
  preview: string;
  largura: number;
  altura: number;
  parecePlanta: boolean;
  parecePaginaInteira: boolean;
};

export type AnaliseDoPdf =
  | { ok: true; caminhoStaging: string; itens: ItemCurado[]; avisos: string[] }
  | { ok: false; erro: string };

/**
 * Sobe o PDF para uma área de passagem e devolve as prévias do que dá para
 * extrair.
 *
 * O PDF fica no Storage em vez de as imagens ficarem, porque a curadoria
 * acontece numa requisição diferente e os bytes precisam morar em algum
 * lugar entre uma e outra. Guardar UM arquivo é mais barato que guardar
 * sessenta — e como a extração é determinística, o índice de cada imagem
 * continua valendo quando o corretor mandar gravar.
 */
export async function analisarPdf(empreendimentoId: string, formData: FormData): Promise<AnaliseDoPdf> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha um arquivo PDF." };
  }
  if (arquivo.size > TETO_PDF_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(0);
    return { ok: false, erro: `Este PDF tem ${mb} MB e o limite é 25 MB. Mande a apresentação, não o catálogo inteiro.` };
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const extraidas = extrairImagensDePdf(bytes);

  const avisos: string[] = [];
  for (const { codec, quantidade } of extraidas.naoSuportadas) {
    avisos.push(`${quantidade} ${quantidade === 1 ? "imagem" : "imagens"} em um formato que ainda não sei ler (${codec}).`);
  }
  if (extraidas.descartadasPorTamanho > 0) {
    avisos.push(`${extraidas.descartadasPorTamanho} imagens pequenas demais foram ignoradas — costumam ser logo e ícone.`);
  }
  if (extraidas.imagens.length === TETO_IMAGENS) {
    avisos.push(`Parei nas primeiras ${TETO_IMAGENS} imagens do arquivo.`);
  }

  if (extraidas.imagens.length === 0) {
    return {
      ok: false,
      erro:
        avisos.length > 0
          ? `Não consegui tirar nenhuma foto deste PDF. ${avisos.join(" ")}`
          : "Não encontrei imagem nenhuma dentro deste PDF.",
    };
  }

  const supabase = await createClient();
  const caminhoStaging = `empreendimentos/${empreendimentoId}/_importacao/${Date.now()}.pdf`;
  const { error: erroUpload } = await supabase.storage
    .from("empreendimentos")
    .upload(caminhoStaging, bytes, { contentType: "application/pdf", upsert: true });

  if (erroUpload) {
    console.error("Erro ao guardar o PDF de importação:", erroUpload);
    return { ok: false, erro: "Não consegui guardar o arquivo para trabalhar nele. Tente de novo." };
  }

  const itens: ItemCurado[] = [];
  for (const [indice, imagem] of extraidas.imagens.entries()) {
    const previa = await gerarPreview(imagem.bytes);
    if (!previa) continue; // imagem que o sharp não lê não vai para a grade
    itens.push({
      indice,
      preview: previa.dataUrl,
      largura: imagem.largura,
      altura: imagem.altura,
      parecePlanta: previa.parecePlanta,
      parecePaginaInteira: imagem.parecePaginaInteira,
    });
  }

  return { ok: true, caminhoStaging, itens, avisos };
}
```

- [ ] **Step 2: Provar que compila e que o lint passa**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add "src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts"
git commit -m "feat: analisa o PDF de apresentação e devolve as prévias do que dá para importar"
```

---

### Task 9: a tela — rota, casca e grade de curadoria

**Files:**
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/page.tsx`
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/ImportarClient.tsx`
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemPdf.tsx`
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/GradeCuradoria.tsx`
- Modify: `src/app/corretor/(painel)/imoveis/[slug]/page.tsx` (botão de entrada)

**Interfaces:**
- Consumes: `analisarPdf`, `ItemCurado` (Task 8).
- Produces: `type EscolhaCuradoria = { indice: number; incluir: boolean; tipo: "foto" | "planta"; capa: boolean }` e o componente `GradeCuradoria`, reusado pela aba do Drive (Task 13).

- [ ] **Step 1: Escrever a grade de curadoria**

```tsx
// src/app/corretor/(painel)/imoveis/[slug]/importar/GradeCuradoria.tsx
"use client";

/**
 * Grade compartilhada pelas duas origens (PDF e Drive). Só cuida de
 * ESCOLHER — quem sobe é quem chamou. É por isso que ela recebe as prévias
 * prontas e devolve as escolhas: no PDF a prévia vem de data URL gerada no
 * servidor, no Drive vem do thumbnail do próprio Google.
 */

export type ItemDaGrade = {
  chave: string;
  preview: string;
  legenda: string;
  parecePlanta: boolean;
  aviso?: string;
};

export type EscolhaCuradoria = {
  chave: string;
  incluir: boolean;
  tipo: "foto" | "planta";
  capa: boolean;
};

export function GradeCuradoria({
  itens,
  escolhas,
  aoMudar,
}: {
  itens: ItemDaGrade[];
  escolhas: Record<string, EscolhaCuradoria>;
  aoMudar: (escolhas: Record<string, EscolhaCuradoria>) => void;
}) {
  const trocar = (chave: string, mudanca: Partial<EscolhaCuradoria>) => {
    const atual = escolhas[chave];
    const proximo = { ...escolhas, [chave]: { ...atual, ...mudanca } };
    // Capa é uma só: marcar uma desmarca a anterior.
    if (mudanca.capa) {
      for (const outra of Object.keys(proximo)) {
        if (outra !== chave) proximo[outra] = { ...proximo[outra], capa: false };
      }
    }
    aoMudar(proximo);
  };

  const marcados = Object.values(escolhas).filter((e) => e.incluir).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span>{marcados} de {itens.length} selecionadas</span>
        <div className="flex gap-3">
          <button
            type="button"
            className="underline"
            onClick={() => aoMudar(Object.fromEntries(Object.entries(escolhas).map(([k, e]) => [k, { ...e, incluir: true }])))}
          >
            Marcar todas
          </button>
          <button
            type="button"
            className="underline"
            onClick={() => aoMudar(Object.fromEntries(Object.entries(escolhas).map(([k, e]) => [k, { ...e, incluir: false }])))}
          >
            Desmarcar todas
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {itens.map((item) => {
          const escolha = escolhas[item.chave];
          return (
            <li key={item.chave} className={`rounded-lg border p-2 ${escolha?.incluir ? "border-current" : "opacity-60"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL e thumbnail do Drive não passam pelo otimizador */}
              <img src={item.preview} alt={item.legenda} className="mb-2 aspect-[4/3] w-full rounded object-cover" />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={escolha?.incluir ?? false}
                  onChange={(e) => trocar(item.chave, { incluir: e.target.checked })}
                />
                Usar
              </label>

              <div className="mt-1 flex gap-2 text-sm">
                {(["foto", "planta"] as const).map((tipo) => (
                  <label key={tipo} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`tipo-${item.chave}`}
                      checked={escolha?.tipo === tipo}
                      onChange={() => trocar(item.chave, { tipo })}
                    />
                    {tipo === "foto" ? "Foto" : "Planta"}
                  </label>
                ))}
              </div>

              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="radio" name="capa" checked={escolha?.capa ?? false} onChange={() => trocar(item.chave, { capa: true })} />
                Capa
              </label>

              <p className="mt-1 text-xs opacity-70">{item.legenda}</p>
              {item.aviso ? <p className="mt-1 text-xs">{item.aviso}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Escrever a aba do PDF**

```tsx
// src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemPdf.tsx
"use client";

import { useState } from "react";
import { analisarPdf, type AnaliseDoPdf } from "./acoes";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";

export function OrigemPdf({ empreendimentoId }: { empreendimentoId: string; slug: string }) {
  const [analise, setAnalise] = useState<AnaliseDoPdf | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaCuradoria>>({});
  const [lendo, setLendo] = useState(false);

  const aoEscolherArquivo = async (arquivo: File) => {
    setLendo(true);
    setAnalise(null);
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    const resultado = await analisarPdf(empreendimentoId, formData);
    setAnalise(resultado);
    if (resultado.ok) {
      setEscolhas(
        Object.fromEntries(
          resultado.itens.map((item) => [
            String(item.indice),
            {
              chave: String(item.indice),
              // Página inteira do deck entra DESMARCADA: quase sempre tem
              // logo e texto por cima, e marcar por padrão faria o corretor
              // desmarcar uma por uma.
              incluir: !item.parecePaginaInteira,
              tipo: item.parecePlanta ? ("planta" as const) : ("foto" as const),
              capa: false,
            },
          ]),
        ),
      );
    }
    setLendo(false);
  };

  const itens: ItemDaGrade[] =
    analise?.ok === true
      ? analise.itens.map((item) => ({
          chave: String(item.indice),
          preview: item.preview,
          legenda: `${item.largura} × ${item.altura}`,
          parecePlanta: item.parecePlanta,
          aviso: item.parecePaginaInteira ? "Parece a página inteira da apresentação" : undefined,
        }))
      : [];

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="application/pdf"
        disabled={lendo}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void aoEscolherArquivo(arquivo);
        }}
      />

      {lendo ? <p>Abrindo a apresentação…</p> : null}
      {analise?.ok === false ? <p role="alert">{analise.erro}</p> : null}
      {analise?.ok === true && analise.avisos.length > 0 ? (
        <ul className="text-sm opacity-80">
          {analise.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      ) : null}

      {analise?.ok === true ? <GradeCuradoria itens={itens} escolhas={escolhas} aoMudar={setEscolhas} /> : null}
      {/* O botão de gravar entra na Task 10. */}
    </div>
  );
}
```

- [ ] **Step 3: Escrever a casca e a rota**

```tsx
// src/app/corretor/(painel)/imoveis/[slug]/importar/ImportarClient.tsx
"use client";

import { useState } from "react";
import { OrigemPdf } from "./OrigemPdf";

export function ImportarClient({ empreendimentoId, slug, nome }: { empreendimentoId: string; slug: string; nome: string }) {
  const [origem, setOrigem] = useState<"pdf" | "drive">("pdf");

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="text-xl font-medium">Importar material</h1>
        <p className="opacity-70">{nome}</p>
      </header>

      <nav className="flex gap-2">
        <button type="button" onClick={() => setOrigem("pdf")} aria-pressed={origem === "pdf"}>
          Apresentação em PDF
        </button>
        <button type="button" onClick={() => setOrigem("drive")} aria-pressed={origem === "drive"}>
          Pasta do Drive
        </button>
      </nav>

      {origem === "pdf" ? <OrigemPdf empreendimentoId={empreendimentoId} slug={slug} /> : <p>Em breve.</p>}
    </div>
  );
}
```

```tsx
// src/app/corretor/(painel)/imoveis/[slug]/importar/page.tsx
import { notFound } from "next/navigation";
import { buscarEmpreendimentoParaEdicao } from "../../actions";
import { ImportarClient } from "./ImportarClient";

export default async function ImportarMaterialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const imovel = await buscarEmpreendimentoParaEdicao(slug);
  if (!imovel) notFound();

  return <ImportarClient empreendimentoId={imovel.id} slug={slug} nome={imovel.nome} />;
}
```

**Antes de escrever:** conferir em `node_modules/next/dist/docs/` a forma atual de `params` em page (nesta versão é `Promise`), e conferir como as outras `page.tsx` do painel fazem a guarda de sessão — repetir o mesmo padrão aqui.

- [ ] **Step 4: Botão de entrada na tela do imóvel**

Em `src/app/corretor/(painel)/imoveis/[slug]/page.tsx`, um link para `/corretor/imoveis/${slug}/importar` com o texto **"Importar material"**, ao lado do editor de fotos, seguindo o estilo dos botões que já existem ali.

- [ ] **Step 5: Rodar a tela de verdade**

Run: `npm run dev`, entrar em `/corretor/imoveis/<slug>/importar`, escolher um PDF de apresentação real, conferir que a grade aparece com as prévias e que página-inteira vem desmarcada.
Expected: grade renderiza; nenhum erro no console.

- [ ] **Step 6: Commit**

```bash
git add "src/app/corretor/(painel)/imoveis/[slug]/importar" "src/app/corretor/(painel)/imoveis/[slug]/page.tsx"
git commit -m "feat: tela de importar material com curadoria das imagens do PDF"
```

---

### Task 10: gravar o que foi escolhido, e limpar a área de passagem

**Files:**
- Modify: `src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts`
- Modify: `src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemPdf.tsx`

**Interfaces:**
- Consumes: `registrarMidia` (Task 7), `caminhoStaging` e `indice` (Task 8), `EscolhaCuradoria` (Task 9).
- Produces: `gravarEscolhasDoPdf(entrada: { empreendimentoId: string; slug: string; caminhoStaging: string; escolhas: { indice: number; tipo: "foto" | "planta"; capa: boolean }[] }): Promise<{ ok: boolean; gravadas: number; duplicadas: number; falhas: string[]; erro?: string }>`.

- [ ] **Step 1: Escrever a action de gravação**

```ts
// acrescentar em .../importar/acoes.ts
import { registrarMidia } from "@/lib/imoveis/registrarMidia";
import { revalidatePath } from "next/cache";

/**
 * Re-extrai o PDF guardado e sobe SÓ os índices escolhidos.
 *
 * Re-extrair em vez de guardar as imagens: a extração é determinística, e
 * assim a área de passagem guarda um arquivo em vez de sessenta. O custo é
 * uma segunda varredura do mesmo PDF, que roda em milissegundos.
 *
 * Um item por vez, com o resultado de cada um separado: o teto de função no
 * plano Hobby é 60s, e o corretor precisa saber QUAL foto falhou.
 */
export async function gravarEscolhasDoPdf(entrada: {
  empreendimentoId: string;
  slug: string;
  caminhoStaging: string;
  escolhas: { indice: number; tipo: "foto" | "planta"; capa: boolean }[];
}): Promise<{ ok: boolean; gravadas: number; duplicadas: number; falhas: string[]; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, gravadas: 0, duplicadas: 0, falhas: [], erro: "Sessão expirada. Entre de novo." };
  if (entrada.escolhas.length === 0) {
    return { ok: false, gravadas: 0, duplicadas: 0, falhas: [], erro: "Marque pelo menos uma imagem." };
  }

  const supabase = await createClient();
  const baixado = await supabase.storage.from("empreendimentos").download(entrada.caminhoStaging);
  if (baixado.error || !baixado.data) {
    return {
      ok: false,
      gravadas: 0,
      duplicadas: 0,
      falhas: [],
      erro: "O arquivo que eu estava usando não está mais aqui. Escolha o PDF de novo.",
    };
  }

  const pdf = Buffer.from(await baixado.data.arrayBuffer());
  const extraidas = extrairImagensDePdf(pdf);

  const deps = {
    async subir(caminho: string, conteudo: Buffer, contentType: string) {
      const { error } = await supabase.storage
        .from("empreendimentos")
        .upload(caminho, conteudo, { contentType, upsert: true });
      return { erro: error?.message ?? null };
    },
    urlPublica(caminho: string) {
      return supabase.storage.from("empreendimentos").getPublicUrl(caminho).data.publicUrl;
    },
    async inserir(linha: Parameters<Parameters<typeof registrarMidia>[0]["inserir"]>[0]) {
      const { data, error } = await supabase.from("midias").insert(linha).select("id").single();
      if (error?.code === "23505") return { id: null, duplicada: true, erro: null };
      if (error) {
        console.error("Erro ao registrar mídia importada:", error);
        return { id: null, duplicada: false, erro: error.message };
      }
      return { id: data.id, duplicada: false, erro: null };
    },
  };

  let gravadas = 0;
  let duplicadas = 0;
  const falhas: string[] = [];

  for (const escolha of entrada.escolhas) {
    const imagem = extraidas.imagens[escolha.indice];
    if (!imagem) {
      falhas.push(`Imagem ${escolha.indice + 1} não foi encontrada na segunda leitura do arquivo.`);
      continue;
    }

    const resultado = await registrarMidia(deps, {
      empreendimentoId: entrada.empreendimentoId,
      bytes: imagem.bytes,
      mime: imagem.mime,
      tipo: escolha.tipo,
      alt: escolha.tipo === "planta" ? "Planta do empreendimento" : "Foto do empreendimento",
      // Capa é ordem 0, mesma convenção de `definirFotoComoCapa`.
      ordem: escolha.capa ? 0 : 10,
    });

    if (!resultado.ok) falhas.push(`Imagem ${escolha.indice + 1}: ${resultado.erro}`);
    else if (resultado.duplicada) duplicadas++;
    else gravadas++;
  }

  // O PDF de passagem já cumpriu o papel; deixá-lo no bucket seria lixo que
  // ninguém volta a abrir.
  await supabase.storage.from("empreendimentos").remove([entrada.caminhoStaging]);

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, gravadas, duplicadas, falhas };
}
```

- [ ] **Step 2: Ligar o botão na aba do PDF**

Em `OrigemPdf.tsx`, acrescentar estado `gravando`/`resumo` e o botão:

```tsx
  const gravar = async () => {
    if (analise?.ok !== true) return;
    setGravando(true);
    const resultado = await gravarEscolhasDoPdf({
      empreendimentoId,
      slug,
      caminhoStaging: analise.caminhoStaging,
      escolhas: Object.values(escolhas)
        .filter((e) => e.incluir)
        .map((e) => ({ indice: Number(e.chave), tipo: e.tipo, capa: e.capa })),
    });
    setGravando(false);
    setResumo(
      resultado.ok
        ? [
            `${resultado.gravadas} ${resultado.gravadas === 1 ? "imagem adicionada" : "imagens adicionadas"}.`,
            resultado.duplicadas > 0 ? `${resultado.duplicadas} já estavam no imóvel.` : "",
            ...resultado.falhas,
          ]
            .filter(Boolean)
            .join(" ")
        : (resultado.erro ?? "Não consegui gravar agora."),
    );
    // Uma vez gravado, o PDF de passagem já foi apagado: nova importação
    // começa escolhendo o arquivo de novo.
    if (resultado.ok) setAnalise(null);
  };
```

- [ ] **Step 3: Provar de ponta a ponta**

Run: `npm run dev` → importar um PDF real, marcar 3 imagens, gravar.
Expected: as 3 aparecem na galeria do imóvel; a página pública mostra as fotos; rodar de novo o mesmo PDF com as mesmas 3 responde "já estavam no imóvel" e **não** duplica.

Conferir no banco:
```sql
select tipo, largura, altura, (blur_data_url is not null) as tem_blur, left(hash_conteudo, 12)
  from midias where empreendimento_id = '<id>' order by ordem;
```
Expected: largura/altura reais (nada de 1920×1080 em todas), `tem_blur = true`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/corretor/(painel)/imoveis/[slug]/importar"
git commit -m "feat: grava as imagens escolhidas do PDF e limpa a área de passagem"
```

---

### Task 11: `parsearLinkDrive` — o link que a construtora manda

**Files:**
- Create: `src/lib/imoveis/drive.ts`
- Test: `src/lib/imoveis/drive.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `parsearLinkDrive(url: string): { tipo: "pasta" | "arquivo"; id: string } | { tipo: "nao_reconhecido"; motivo: string }`. Usado pela Task 12.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/imoveis/drive.test.ts
import { describe, expect, it } from "vitest";
import { parsearLinkDrive } from "./drive";

describe("parsearLinkDrive", () => {
  it("lê link de pasta com sufixo de compartilhamento", () => {
    expect(parsearLinkDrive("https://drive.google.com/drive/folders/1A2b3C4d5E6f?usp=sharing")).toEqual({
      tipo: "pasta",
      id: "1A2b3C4d5E6f",
    });
  });

  it("lê link de pasta de Drive compartilhado", () => {
    expect(parsearLinkDrive("https://drive.google.com/drive/u/0/folders/1A2b3C4d5E6f")).toEqual({
      tipo: "pasta",
      id: "1A2b3C4d5E6f",
    });
  });

  it("lê link de arquivo único", () => {
    expect(parsearLinkDrive("https://drive.google.com/file/d/1XyZ_abc-123/view?usp=drive_link")).toEqual({
      tipo: "arquivo",
      id: "1XyZ_abc-123",
    });
  });

  it("lê o formato antigo com id na query", () => {
    expect(parsearLinkDrive("https://drive.google.com/open?id=1XyZ_abc-123")).toEqual({
      tipo: "arquivo",
      id: "1XyZ_abc-123",
    });
  });

  it("recusa link que não é do Drive, dizendo o que aceita", () => {
    const resultado = parsearLinkDrive("https://exemplo.com/fotos");
    expect(resultado.tipo).toBe("nao_reconhecido");
    expect((resultado as { motivo: string }).motivo).toContain("drive.google.com");
  });

  it("recusa texto que nem é URL", () => {
    expect(parsearLinkDrive("me manda as fotos").tipo).toBe("nao_reconhecido");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/drive.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/imoveis/drive.ts
/**
 * Google Drive como origem de material do empreendimento.
 *
 * Só pastas ABERTAS ("qualquer pessoa com o link"), que é o que a
 * construtora manda. Para essas, uma API key basta — OAuth por corretor
 * significaria tela de consentimento, refresh token guardado no banco e o
 * app em revisão pelo Google, para um caso que não aparece.
 */

export type LinkDrive =
  | { tipo: "pasta" | "arquivo"; id: string }
  | { tipo: "nao_reconhecido"; motivo: string };

const RECUSA = {
  tipo: "nao_reconhecido" as const,
  motivo:
    "Não reconheci este link. Cole o endereço da pasta no drive.google.com — aquele que aparece em Compartilhar → Copiar link.",
};

export function parsearLinkDrive(url: string): LinkDrive {
  let endereco: URL;
  try {
    endereco = new URL(url.trim());
  } catch {
    return RECUSA;
  }

  if (!endereco.hostname.endsWith("drive.google.com") && !endereco.hostname.endsWith("docs.google.com")) {
    return RECUSA;
  }

  const pasta = endereco.pathname.match(/\/folders\/([\w-]+)/);
  if (pasta) return { tipo: "pasta", id: pasta[1] };

  const arquivo = endereco.pathname.match(/\/file\/d\/([\w-]+)/);
  if (arquivo) return { tipo: "arquivo", id: arquivo[1] };

  const porQuery = endereco.searchParams.get("id");
  if (porQuery) return { tipo: "arquivo", id: porQuery };

  return RECUSA;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/drive.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/imoveis/drive.ts src/lib/imoveis/drive.test.ts
git commit -m "feat: lê o id de pasta e de arquivo a partir do link do Google Drive"
```

---

### Task 12: listar a pasta do Drive

**Files:**
- Modify: `src/lib/imoveis/drive.ts`
- Test: `src/lib/imoveis/drive.test.ts`

**Interfaces:**
- Consumes: `parsearLinkDrive` (Task 11).
- Produces:
  ```ts
  type ArquivoDrive = { id: string; nome: string; mime: string; tamanho: number | null; thumbnail: string | null; ehVideo: boolean };
  listarPasta(id: string): Promise<{ ok: true; arquivos: ArquivoDrive[] } | { ok: false; erro: string }>
  baixarArquivo(id: string): Promise<{ ok: true; bytes: Buffer; mime: string } | { ok: false; erro: string }>
  ```
  Usados pela Task 13.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// acrescentar em src/lib/imoveis/drive.test.ts
import { afterEach, beforeEach, vi } from "vitest";
import { listarPasta } from "./drive";

describe("listarPasta", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_API_KEY", "chave-de-teste");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("separa imagem de vídeo e ignora o resto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          files: [
            { id: "a", name: "fachada.jpg", mimeType: "image/jpeg", size: "3000000", thumbnailLink: "https://t/a" },
            { id: "b", name: "tour.mp4", mimeType: "video/mp4", size: "300000000" },
            { id: "c", name: "tabela.xlsx", mimeType: "application/vnd.ms-excel", size: "20000" },
          ],
        }),
      ),
    );

    const resultado = await listarPasta("pasta-1");

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.arquivos.map((a) => a.nome)).toEqual(["fachada.jpg", "tour.mp4"]);
    expect(resultado.arquivos[1].ehVideo).toBe(true);
  });

  it("explica em português que a pasta não está aberta quando o Google recusa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

    const resultado = await listarPasta("pasta-fechada");

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.erro).toMatch(/qualquer pessoa com o link/i);
  });

  it("diz que falta configurar quando não há chave", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    const resultado = await listarPasta("pasta-1");
    expect(resultado).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/drive.test.ts`
Expected: FAIL — `listarPasta` não existe.

- [ ] **Step 3: Implementar**

```ts
// acrescentar em src/lib/imoveis/drive.ts
export type ArquivoDrive = {
  id: string;
  nome: string;
  mime: string;
  tamanho: number | null;
  /** Miniatura que o próprio Google devolve — evita baixar para curar. */
  thumbnail: string | null;
  ehVideo: boolean;
};

const CAMPOS = "files(id,name,mimeType,size,thumbnailLink)";

function chave(): string | null {
  const valor = process.env.GOOGLE_API_KEY;
  return valor && valor.length > 0 ? valor : null;
}

/**
 * Lista o que interessa numa pasta aberta do Drive.
 *
 * `supportsAllDrives` e `includeItemsFromAllDrives` ligados porque pasta de
 * construtora quase sempre mora num Drive compartilhado — sem eles a
 * listagem volta vazia e parece pasta sem foto.
 */
export async function listarPasta(id: string): Promise<{ ok: true; arquivos: ArquivoDrive[] } | { ok: false; erro: string }> {
  const key = chave();
  if (!key) {
    return { ok: false, erro: "A busca por link do Drive ainda não está configurada neste ambiente." };
  }

  const endereco = new URL("https://www.googleapis.com/drive/v3/files");
  endereco.searchParams.set("q", `'${id}' in parents and trashed = false`);
  endereco.searchParams.set("fields", CAMPOS);
  endereco.searchParams.set("pageSize", "200");
  endereco.searchParams.set("supportsAllDrives", "true");
  endereco.searchParams.set("includeItemsFromAllDrives", "true");
  endereco.searchParams.set("key", key);

  let resposta: Response;
  try {
    resposta = await fetch(endereco, { cache: "no-store" });
  } catch {
    return { ok: false, erro: "Não consegui falar com o Google agora. Tente de novo em instantes." };
  }

  if (resposta.status === 404 || resposta.status === 403) {
    return {
      ok: false,
      erro: "Não consegui abrir esta pasta. No Drive, em Compartilhar, marque 'qualquer pessoa com o link' e mande o endereço de novo.",
    };
  }
  if (!resposta.ok) {
    return { ok: false, erro: "O Google recusou a consulta agora. Tente de novo em instantes." };
  }

  const corpo = (await resposta.json()) as {
    files?: { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string }[];
  };

  const arquivos = (corpo.files ?? [])
    .filter((arquivo) => arquivo.mimeType.startsWith("image/") || arquivo.mimeType.startsWith("video/"))
    .map((arquivo) => ({
      id: arquivo.id,
      nome: arquivo.name,
      mime: arquivo.mimeType,
      tamanho: arquivo.size ? Number(arquivo.size) : null,
      thumbnail: arquivo.thumbnailLink ?? null,
      ehVideo: arquivo.mimeType.startsWith("video/"),
    }));

  return { ok: true, arquivos };
}

/** Baixa UM arquivo. Um por chamada: o teto de função no Hobby é 60s. */
export async function baixarArquivo(id: string): Promise<{ ok: true; bytes: Buffer; mime: string } | { ok: false; erro: string }> {
  const key = chave();
  if (!key) return { ok: false, erro: "A busca por link do Drive ainda não está configurada neste ambiente." };

  const endereco = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
  endereco.searchParams.set("alt", "media");
  endereco.searchParams.set("supportsAllDrives", "true");
  endereco.searchParams.set("key", key);

  try {
    const resposta = await fetch(endereco, { cache: "no-store" });
    if (!resposta.ok) return { ok: false, erro: "O Google não entregou este arquivo." };
    return {
      ok: true,
      bytes: Buffer.from(await resposta.arrayBuffer()),
      mime: resposta.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return { ok: false, erro: "A transferência caiu no meio." };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/drive.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Configurar a chave**

1. Console do Google → criar API key → **restringir à Google Drive API**.
2. `GOOGLE_API_KEY` em Settings → Environment Variables → Production, na Vercel.
3. **Redeploy** — env var nova só vale depois de um build novo (as funções congelam o ambiente no build; ver `docs/MEMORIA.md`).
4. Local: acrescentar a mesma chave no `.env.local`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/imoveis/drive.ts src/lib/imoveis/drive.test.ts
git commit -m "feat: lista pasta aberta do Drive e baixa um arquivo por vez"
```

---

### Task 13: aba do Drive — curar antes de transferir, um arquivo por chamada

**Files:**
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemDrive.tsx`
- Modify: `src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts`
- Modify: `src/app/corretor/(painel)/imoveis/[slug]/importar/ImportarClient.tsx`

**Interfaces:**
- Consumes: `listarPasta`, `baixarArquivo` (Task 12), `registrarMidia` (Task 7), `GradeCuradoria` (Task 9).
- Produces:
  - `listarMaterialDoDrive(link: string): Promise<{ ok: true; arquivos: ArquivoDrive[] } | { ok: false; erro: string }>`
  - `trazerArquivoDoDrive(entrada: { empreendimentoId: string; slug: string; arquivoId: string; nome: string; tipo: "foto" | "planta"; capa: boolean }): Promise<{ ok: boolean; duplicada?: boolean; erro?: string }>`

- [ ] **Step 1: Escrever as actions**

```ts
// acrescentar em .../importar/acoes.ts
import { baixarArquivo, listarPasta, parsearLinkDrive, type ArquivoDrive } from "@/lib/imoveis/drive";

export async function listarMaterialDoDrive(
  link: string,
): Promise<{ ok: true; arquivos: ArquivoDrive[] } | { ok: false; erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const alvo = parsearLinkDrive(link);
  if (alvo.tipo === "nao_reconhecido") return { ok: false, erro: alvo.motivo };
  if (alvo.tipo === "arquivo") {
    return { ok: false, erro: "Este link é de um arquivo só. Cole o link da PASTA com o material." };
  }

  return listarPasta(alvo.id);
}

/**
 * Traz UM arquivo do Drive. O cliente chama uma vez por arquivo escolhido,
 * três em paralelo — o teto de função no Hobby é 60s, e uma pasta inteira
 * num request só estoura e perde tudo. Assim há barra de progresso,
 * retomada, e o arquivo que falha aparece nomeado sem derrubar os outros.
 */
export async function trazerArquivoDoDrive(entrada: {
  empreendimentoId: string;
  slug: string;
  arquivoId: string;
  nome: string;
  tipo: "foto" | "planta";
  capa: boolean;
}): Promise<{ ok: boolean; duplicada?: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const baixado = await baixarArquivo(entrada.arquivoId);
  if (!baixado.ok) return { ok: false, erro: baixado.erro };

  const supabase = await createClient();
  const resultado = await registrarMidia(
    {
      async subir(caminho, conteudo, contentType) {
        const { error } = await supabase.storage
          .from("empreendimentos")
          .upload(caminho, conteudo, { contentType, upsert: true });
        return { erro: error?.message ?? null };
      },
      urlPublica(caminho) {
        return supabase.storage.from("empreendimentos").getPublicUrl(caminho).data.publicUrl;
      },
      async inserir(linha) {
        const { data, error } = await supabase.from("midias").insert(linha).select("id").single();
        if (error?.code === "23505") return { id: null, duplicada: true, erro: null };
        if (error) {
          console.error("Erro ao registrar mídia do Drive:", error);
          return { id: null, duplicada: false, erro: error.message };
        }
        return { id: data.id, duplicada: false, erro: null };
      },
    },
    {
      empreendimentoId: entrada.empreendimentoId,
      bytes: baixado.bytes,
      mime: baixado.mime,
      tipo: entrada.tipo,
      alt: entrada.nome.replace(/\.[^.]+$/, ""),
      ordem: entrada.capa ? 0 : 10,
    },
  );

  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidatePath("/corretor/imoveis");
  return { ok: true, duplicada: resultado.duplicada };
}
```

- [ ] **Step 2: Escrever a aba**

```tsx
// src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemDrive.tsx
"use client";

import { useState } from "react";
import type { ArquivoDrive } from "@/lib/imoveis/drive";
import { listarMaterialDoDrive, trazerArquivoDoDrive } from "./acoes";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";

/** Três de cada vez: rápido o bastante e sem abrir dezenas de conexões. */
const EM_PARALELO = 3;

export function OrigemDrive({ empreendimentoId, slug }: { empreendimentoId: string; slug: string }) {
  const [link, setLink] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<ArquivoDrive[] | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaCuradoria>>({});
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);

  const buscar = async () => {
    setErro(null);
    setFalhas([]);
    const resultado = await listarMaterialDoDrive(link);
    if (!resultado.ok) {
      setErro(resultado.erro);
      setArquivos(null);
      return;
    }
    setArquivos(resultado.arquivos);
    setEscolhas(
      Object.fromEntries(
        resultado.arquivos
          .filter((a) => !a.ehVideo)
          .map((a) => [a.id, { chave: a.id, incluir: true, tipo: "foto" as const, capa: false }]),
      ),
    );
  };

  const trazer = async () => {
    if (!arquivos) return;
    const escolhidos = Object.values(escolhas).filter((e) => e.incluir);
    setProgresso({ feitos: 0, total: escolhidos.length });
    setFalhas([]);

    let feitos = 0;
    const problemas: string[] = [];
    const fila = [...escolhidos];

    const trabalhador = async () => {
      while (fila.length > 0) {
        const escolha = fila.shift();
        if (!escolha) break;
        const arquivo = arquivos.find((a) => a.id === escolha.chave);
        if (!arquivo) continue;

        const resultado = await trazerArquivoDoDrive({
          empreendimentoId,
          slug,
          arquivoId: arquivo.id,
          nome: arquivo.nome,
          tipo: escolha.tipo,
          capa: escolha.capa,
        });
        if (!resultado.ok) problemas.push(`${arquivo.nome}: ${resultado.erro ?? "não veio"}`);
        feitos++;
        setProgresso({ feitos, total: escolhidos.length });
      }
    };

    await Promise.all(Array.from({ length: Math.min(EM_PARALELO, escolhidos.length) }, trabalhador));
    setFalhas(problemas);
  };

  const videos = arquivos?.filter((a) => a.ehVideo) ?? [];
  const itens: ItemDaGrade[] =
    arquivos
      ?.filter((a) => !a.ehVideo)
      .map((a) => ({
        chave: a.id,
        preview: a.thumbnail ?? "",
        legenda: a.nome,
        parecePlanta: false,
      })) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Cole aqui o link da pasta do Drive"
          className="flex-1"
        />
        <button type="button" onClick={() => void buscar()}>
          Ver o que tem
        </button>
      </div>

      {erro ? <p role="alert">{erro}</p> : null}

      {videos.length > 0 ? (
        <p>
          {videos.length === 1 ? "Tem 1 vídeo nesta pasta" : `Tem ${videos.length} vídeos nesta pasta`} (
          {videos.map((v) => v.nome).join(", ")}). Suba no YouTube e cole o link na aba de mídias do imóvel — vídeo pesado
          direto no site trava no celular do cliente.
        </p>
      ) : null}

      {arquivos ? <GradeCuradoria itens={itens} escolhas={escolhas} aoMudar={setEscolhas} /> : null}

      {arquivos ? (
        <button type="button" onClick={() => void trazer()} disabled={progresso !== null && progresso.feitos < progresso.total}>
          Trazer as selecionadas
        </button>
      ) : null}

      {progresso ? (
        <p>
          {progresso.feitos} de {progresso.total} prontas
          {progresso.feitos === progresso.total ? " — terminou." : "…"}
        </p>
      ) : null}

      {falhas.length > 0 ? (
        <ul role="alert">
          {falhas.map((falha) => (
            <li key={falha}>{falha}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Ligar na casca**

Em `ImportarClient.tsx`, trocar `<p>Em breve.</p>` por `<OrigemDrive empreendimentoId={empreendimentoId} slug={slug} />`.

- [ ] **Step 4: Provar com uma pasta real**

Run: `npm run dev` → colar link de uma pasta aberta com fotos e ao menos um vídeo.
Expected: grade com as miniaturas do Google; o vídeo aparece só como aviso de YouTube; "Trazer as selecionadas" mostra progresso e as fotos entram na galeria. Colar link de pasta **fechada** devolve a frase sobre "qualquer pessoa com o link".

- [ ] **Step 5: Commit**

```bash
git add "src/app/corretor/(painel)/imoveis/[slug]/importar"
git commit -m "feat: traz fotos de uma pasta aberta do Drive, uma por chamada, com progresso"
```

---

### Task 14: rascunho do cadastro a partir do texto do PDF

**Files:**
- Create: `src/lib/imoveis/rascunhoDePdf.ts`
- Test: `src/lib/imoveis/rascunhoDePdf.test.ts`
- Create: `src/app/corretor/(painel)/imoveis/[slug]/importar/RascunhoCadastro.tsx`
- Modify: `src/app/corretor/(painel)/imoveis/[slug]/importar/acoes.ts`

**Interfaces:**
- Consumes: `extrairTextoDePdf` (`@/lib/leads/pdfTexto`), `chamarLlmJson` (`@/lib/whatsapp/llm`), `analisarPdf` (Task 8).
- Produces: `montarRascunhoDePdf(pdf: Buffer): Promise<RascunhoCadastro | null>`, com campos opcionais e `nenhumCampoDePreco` garantido.

- [ ] **Step 1: Ler a assinatura real de `chamarLlmJson` antes de escrever**

```bash
sed -n '140,220p' src/lib/whatsapp/llm.ts
```
Usar exatamente a assinatura que estiver lá — este plano descreve o papel da função, não a congela.

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/lib/imoveis/rascunhoDePdf.test.ts
import { describe, expect, it, vi } from "vitest";
import { interpretarRascunho } from "./rascunhoDePdf";

describe("interpretarRascunho", () => {
  it("aceita os campos do cadastro que a IA devolveu", () => {
    const rascunho = interpretarRascunho({
      nome: "Residencial Aurora",
      construtora: "Construtora X",
      cidade: "Barueri",
      bairro: "Alphaville",
      status: "em_construcao",
      entregaPrevista: "2027-12",
      tipologias: [{ nome: "3 dorms", dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, metragem: 110 }],
      lazer: ["Piscina", "Academia"],
    });

    expect(rascunho.nome).toBe("Residencial Aurora");
    expect(rascunho.tipologias).toHaveLength(1);
    expect(rascunho.tipologias![0].suites).toBe(1);
  });

  it("IGNORA qualquer campo de preço, mesmo quando o modelo insiste", () => {
    const rascunho = interpretarRascunho({
      nome: "Residencial Aurora",
      precoAPartir: 890000,
      tipologias: [{ nome: "3 dorms", dormitorios: 3, preco: 890000 }],
    }) as Record<string, unknown>;

    expect(rascunho.precoAPartir).toBeUndefined();
    expect(JSON.stringify(rascunho)).not.toContain("890000");
  });

  it("descarta status que não existe no nosso enum em vez de gravar lixo", () => {
    const rascunho = interpretarRascunho({ nome: "X", status: "quase pronto" });
    expect(rascunho.status).toBeUndefined();
  });

  it("devolve objeto vazio para resposta que não é objeto", () => {
    expect(interpretarRascunho(null)).toEqual({});
    expect(interpretarRascunho("texto solto")).toEqual({});
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/imoveis/rascunhoDePdf.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar**

```ts
// src/lib/imoveis/rascunhoDePdf.ts
import { extrairTextoDePdf } from "@/lib/leads/pdfTexto";
import { chamarLlmJson } from "@/lib/whatsapp/llm";

/**
 * Lê o texto de uma apresentação e propõe o cadastro do imóvel.
 *
 * Tudo aqui é PROPOSTA: a tela mostra campo a campo, com o que já está
 * gravado ao lado, e só grava o que o corretor aceitar. O que a IA erra num
 * cadastro não fica no cadastro — vai para o prompt do bot e é afirmado ao
 * cliente como verdade (foi assim que um imóvel `em_construcao` virou
 * "pronto para morar" numa conversa real).
 *
 * PREÇO NÃO ENTRA. A regra de negócio proíbe a IA de falar valores, e o
 * campo é filtrado no código — não no prompt: instrução de prompt é
 * probabilística e falha justo na resposta que importa.
 */

const STATUS_VALIDOS = ["lancamento", "em_construcao", "pronto", "entregue"] as const;

export type TipologiaSugerida = {
  nome: string;
  dormitorios?: number;
  suites?: number;
  banheiros?: number;
  vagas?: number;
  metragem?: number;
};

export type RascunhoCadastro = {
  nome?: string;
  construtora?: string;
  cidade?: string;
  bairro?: string;
  endereco?: string;
  status?: (typeof STATUS_VALIDOS)[number];
  entregaPrevista?: string;
  totalTorres?: number;
  totalAndares?: number;
  totalUnidades?: number;
  tagline?: string;
  descricao?: string;
  tipologias?: TipologiaSugerida[];
  lazer?: string[];
};

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : undefined;
}

function inteiro(valor: unknown): number | undefined {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** Separada de `montarRascunhoDePdf` para ser testável sem chamar modelo. */
export function interpretarRascunho(bruto: unknown): RascunhoCadastro {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const cru = bruto as Record<string, unknown>;

  const status = texto(cru.status);
  const tipologias = Array.isArray(cru.tipologias)
    ? cru.tipologias
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const t = item as Record<string, unknown>;
          const nome = texto(t.nome);
          if (!nome) return null;
          // Preço de tipologia é descartado aqui, junto com o resto.
          return {
            nome,
            dormitorios: inteiro(t.dormitorios),
            suites: inteiro(t.suites),
            banheiros: inteiro(t.banheiros),
            vagas: inteiro(t.vagas),
            metragem: inteiro(t.metragem),
          };
        })
        .filter((t): t is TipologiaSugerida => t !== null)
    : undefined;

  return {
    nome: texto(cru.nome),
    construtora: texto(cru.construtora),
    cidade: texto(cru.cidade),
    bairro: texto(cru.bairro),
    endereco: texto(cru.endereco),
    status: STATUS_VALIDOS.includes(status as never) ? (status as RascunhoCadastro["status"]) : undefined,
    entregaPrevista: texto(cru.entregaPrevista),
    totalTorres: inteiro(cru.totalTorres),
    totalAndares: inteiro(cru.totalAndares),
    totalUnidades: inteiro(cru.totalUnidades),
    tagline: texto(cru.tagline),
    descricao: texto(cru.descricao),
    tipologias: tipologias && tipologias.length > 0 ? tipologias : undefined,
    lazer: Array.isArray(cru.lazer) ? cru.lazer.map(texto).filter((v): v is string => Boolean(v)) : undefined,
  };
}

const INSTRUCAO = `Você lê apresentações de empreendimentos imobiliários e devolve o cadastro em JSON.

Regras:
- Responda SÓ com JSON, sem cerca de código e sem comentário.
- NUNCA inclua preço, valor, condição de pagamento ou entrada. Se o texto tiver, ignore.
- Campo que o texto não deixar claro: OMITA. Não invente e não chute.
- "status" só pode ser: lancamento, em_construcao, pronto, entregue.
- "entregaPrevista" no formato AAAA-MM.

Formato:
{"nome":"","construtora":"","cidade":"","bairro":"","endereco":"","status":"","entregaPrevista":"",
 "totalTorres":0,"totalAndares":0,"totalUnidades":0,"tagline":"","descricao":"",
 "tipologias":[{"nome":"","dormitorios":0,"suites":0,"banheiros":0,"vagas":0,"metragem":0}],
 "lazer":[""]}`;

export async function montarRascunhoDePdf(pdf: Buffer): Promise<RascunhoCadastro | null> {
  const conteudo = extrairTextoDePdf(pdf);
  if (!conteudo || conteudo.length < 200) return null;

  const resposta = await chamarLlmJson({
    instrucao: INSTRUCAO,
    entrada: conteudo.slice(0, 12_000),
    origem: "importacao_imovel",
  });

  return resposta ? interpretarRascunho(resposta) : null;
}
```

**Nota:** o objeto passado a `chamarLlmJson` acima é ilustrativo — usar a assinatura real lida no Step 1, sem mudar o comportamento descrito.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/imoveis/rascunhoDePdf.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Mostrar o rascunho na tela, campo a campo**

`analisarPdf` passa a chamar `montarRascunhoDePdf(bytes)` e devolver `rascunho` junto. `RascunhoCadastro.tsx` lista cada campo com: rótulo, valor sugerido, valor atual do cadastro, e uma caixa "aplicar". Só o que estiver marcado vai para `salvarDadosGerais`. Nada é gravado sem clique.

Se `montarRascunhoDePdf` devolver `null` (sem texto no PDF, ou cascata de IA fora do ar), a tela diz: **"Não consegui ler os dados escritos nesta apresentação — as imagens continuam disponíveis acima."** Imagem e rascunho são independentes de propósito.

- [ ] **Step 7: Commit**

```bash
git add src/lib/imoveis/rascunhoDePdf.ts src/lib/imoveis/rascunhoDePdf.test.ts "src/app/corretor/(painel)/imoveis/[slug]/importar"
git commit -m "feat: propõe o cadastro a partir do texto da apresentação, sem tocar em preço"
```

---

### Task 15: registrar o aprendizado e subir

**Files:**
- Modify: `docs/MEMORIA.md`

**Interfaces:**
- Consumes: tudo.
- Produces: nada de código.

- [ ] **Step 1: Rodar a suíte inteira e o lint**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 2: Escrever a seção nova em `docs/MEMORIA.md`**

Seção "Ingestão de material do empreendimento", com o que só se descobre fazendo:

- O insert de `midias` gravava `1920x1080` chumbado e nunca preenchia `blur_data_url`, com oito componentes da vitrine lendo os dois campos. Agora existe um caminho único (`registrarMidia`) e a regra é: **nenhum insert em `midias` fora dele**.
- `sharp` era `devDependency` e virou dependência de runtime porque as derivadas passaram a rodar em server action. A receita do blur (12px, WebP q45) veio de `scripts/gerar-blur.mjs` e **não pode mudar** sem deixar as fotos novas com placeholder diferente das antigas.
- No PDF, `/DCTDecode` significa que os bytes do stream **já são um JPEG** — copiar cru preserva a resolução original. O que a página mostra é uma redução; o arquivo embutido costuma ser maior.
- O `endstream` vem depois de uma quebra de linha que **não** faz parte do JPEG. Sem recortar esses bytes o `sharp` recusa o arquivo.
- O que a medição da F0 disse sobre os decks reais (colar os números).
- Drive: `supportsAllDrives` + `includeItemsFromAllDrives` são obrigatórios — pasta de construtora quase sempre é Drive compartilhado, e sem eles a listagem volta **vazia**, o que parece pasta sem foto.
- Curadoria entre duas requisições: o PDF fica no Storage e é **re-extraído** na hora de gravar (extração determinística = índice estável), e o Drive nem baixa para curar (usa `thumbnailLink`). Nenhuma tabela nova.
- Dedup por hash é o que faz a importação ser retomável — e o índice é **parcial**, porque as mídias antigas não têm hash e um índice único total recusaria a segunda delas.

- [ ] **Step 3: Commit e deploy nas DUAS branches**

```bash
git add docs/MEMORIA.md
git commit -m "docs: o que a ingestão de material ensinou"
git push origin main
git push origin main:claude/modernizar-plataforma-imobiliaria-2tm13q
```

A segunda branch é a de produção da Vercel. Push só em `main` gera preview, nunca produção.

- [ ] **Step 4: Conferir que o deploy nasceu**

Se em ~1 minuto não aparecer deployment novo em `list_deployments`, a causa mais provável é `vercel.json` inválido para o plano — forçar deploy manual pela API da Vercel para ver o erro de verdade (deployment recusado na criação **nunca** aparece no histórico).

---

## Self-Review

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| Curadoria obrigatória | 9, 13 |
| `pdfImagens.ts` (DCT, Flate, não suportados, teto, página inteira) | 2, 3, 4 |
| `imagemDerivada.ts` (medida, blur, preview, palpite de planta) | 5 |
| `rascunhoDePdf.ts` (cascata, sem preço) | 14 |
| `drive.ts` (link, listagem, download, vídeo) | 11, 12, 13 |
| `registrarMidia` + conserto da dimensão e do blur | 7 |
| Estado intermediário (staging do PDF, thumbnail do Drive) | 8, 10, 13 |
| Migration 0042 (hash, índice parcial, grants) | 6 |
| Tabela de erros | 8, 10, 12, 13, 14 |
| Testes listados | 2, 3, 4, 5, 7, 11, 12, 14 |
| F0 (medição) | 1 |
| F6 (vídeo → YouTube) | 13 |

**Sem placeholder:** nenhum "TBD"/"depois". Os dois lugares onde o plano manda **ler o código antes de escrever** (assinatura de `chamarLlmJson` na Task 14; forma de `params` e guarda de sessão na Task 9) são instruções de verificação, não buracos — o comportamento esperado está descrito em ambos.

**Consistência de tipos:** `ImagemExtraida` (Tasks 2-4) é consumida por `analisarPdf` e `gravarEscolhasDoPdf` com os mesmos campos; `DepsMidia`/`EntradaMidia` (Task 7) aparecem com a mesma forma nas Tasks 10 e 13; `EscolhaCuradoria` usa `chave: string` em todos os pontos (o PDF converte índice para string e de volta com `Number(e.chave)`); `ArquivoDrive` (Task 12) é usado igual na Task 13.

**Falta consciente:** não há E2E autenticado do painel — o Playwright está no `package.json` mas não há config, e montar isso é trabalho próprio (registrado em `docs/MEMORIA.md` desde a F6 do Painel de Bolso). A prova das telas é manual, nos steps "provar de ponta a ponta" das Tasks 9, 10 e 13.
