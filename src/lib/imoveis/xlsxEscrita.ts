import { deflateRawSync } from "node:zlib";

/**
 * Gerador de .xlsx caseiro, do tamanho do que o painel precisa: UMA aba,
 * texto e número, cabeçalho em negrito, filtro e primeira linha congelada.
 *
 * Mesmo motivo de `leads/zipLeitura.ts`: xlsx é um ZIP com meia dúzia de
 * XMLs, e o Node já traz o `deflateRaw`. Uma biblioteca de planilha inteira
 * para escrever uma tabela custaria mais em peso de função do que resolve.
 *
 * Texto vai como `inlineStr` (sem tabela de textos compartilhados): o Excel,
 * o Google Planilhas e o LibreOffice abrem igual, e o leitor da própria casa
 * (`lerPlanilhaXlsx`) também — o teste confere a ida e a volta por ele.
 */

export type Celula = string | number | null;

export type Coluna = {
  titulo: string;
  /** Largura em caracteres, como o Excel mede. */
  largura: number;
  /** Texto longo (descrição, plantas) quebra linha em vez de vazar. */
  quebra?: boolean;
};

export type Planilha = {
  aba: string;
  colunas: Coluna[];
  linhas: Celula[][];
};

/** Caracteres de controle que o XML recusa, e o Excel junto com ele. */
const PROIBIDOS_NO_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapar(texto: string): string {
  return texto
    .replace(PROIBIDOS_NO_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letraDaColuna(indice: number): string {
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

/** Nome de aba: até 31 caracteres e sem os sete que o Excel proíbe. */
function nomeDeAba(nome: string): string {
  const limpo = nome.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return limpo || "Planilha";
}

// Estilos: 0 = padrão, 1 = cabeçalho em negrito, 2 = texto que quebra linha.
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function xmlDaAba(planilha: Planilha): string {
  const { colunas, linhas } = planilha;
  const cols = colunas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}" customWidth="1"/>`)
    .join("");

  const cabecalho = `<row r="1">${colunas
    .map((c, i) => `<c r="${letraDaColuna(i)}1" t="inlineStr" s="1"><is><t>${escapar(c.titulo)}</t></is></c>`)
    .join("")}</row>`;

  const corpo = linhas
    .map((linha, l) => {
      const r = l + 2;
      const celulas = linha
        .map((valor, i) => {
          if (valor === null || valor === "") return "";
          const ref = `${letraDaColuna(i)}${r}`;
          const estilo = colunas[i]?.quebra ? 2 : 0;
          if (typeof valor === "number" && Number.isFinite(valor)) {
            return `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr" s="${estilo}"><is><t xml:space="preserve">${escapar(String(valor))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r}">${celulas}</row>`;
    })
    .join("");

  const ultima = `${letraDaColuna(Math.max(colunas.length - 1, 0))}${linhas.length + 1}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${cabecalho}${corpo}</sheetData>
<autoFilter ref="A1:${ultima}"/>
</worksheet>`;
}

function arquivosDaPlanilha(entrada: Planilha | Planilha[]): { nome: string; conteudo: string }[] {
  const planilhas = Array.isArray(entrada) ? entrada : [entrada];
  // Nome de aba repetido o Excel recusa ao abrir: o segundo ganha um número.
  const usados = new Set<string>();
  const nomes = planilhas.map((p) => {
    const base = nomeDeAba(p.aba);
    let nome = base;
    for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${base.slice(0, 27)} (${n})`;
    usados.add(nome.toLowerCase());
    return nome;
  });
  const n = planilhas.length;
  return [
    {
      nome: "[Content_Types].xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${planilhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      nome: "_rels/.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((nome, i) => `<sheet name="${escapar(nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
<definedNames>${planilhas
        .map(
          (p, i) =>
            `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapar(nomes[i]).replace(/'/g, "''")}'!$A$1:$${letraDaColuna(Math.max(p.colunas.length - 1, 0))}$${p.linhas.length + 1}</definedName>`,
        )
        .join("")}</definedNames>
</workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${planilhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nome: "xl/styles.xml", conteudo: ESTILOS },
    ...planilhas.map((p, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: xmlDaAba(p) })),
  ];
}

// ─── ZIP ────────────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP comum com `deflate` (método 8), sem ZIP64: uma tabela de catálogo não chega perto de 4 GB. */
export function montarZip(arquivos: { nome: string; conteudo: Buffer }[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, "utf8");
    const comprimido = deflateRawSync(arquivo.conteudo);
    const crc = crc32(arquivo.conteudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nome em UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // 01/01/1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(arquivo.conteudo.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(arquivo.conteudo.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);

    deslocamento += local.length + nome.length + comprimido.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return Buffer.concat([...locais, diretorio, fim]);
}

/** Uma planilha (`Planilha`) ou várias abas no mesmo arquivo (`Planilha[]`). */
export function gerarXlsx(planilha: Planilha | Planilha[]): Buffer {
  return montarZip(
    arquivosDaPlanilha(planilha).map((a) => ({ nome: a.nome, conteudo: Buffer.from(a.conteudo, "utf8") })),
  );
}
