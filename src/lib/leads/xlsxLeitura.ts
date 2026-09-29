import { lerZip, type MotivoZipIlegivel } from "./zipLeitura";

/**
 * Planilha do Excel (.xlsx) lida sem dependência nova.
 *
 * Um `.xlsx` é um ZIP com XML dentro, e o leitor de ZIP já existe para a
 * conversa do WhatsApp. Uma biblioteca de planilha traria centenas de KB
 * para ler três arquivos: a lista de abas, os textos compartilhados e a
 * própria aba.
 *
 * Só o `.xlsx` (Excel 2007 em diante). O `.xls` antigo é formato binário
 * proprietário, e quem ainda o tem consegue salvar como `.xlsx` em um passo.
 */

export type AbaDaPlanilha = {
  nome: string;
  /** Linhas já alinhadas por coluna: célula vazia vira "". */
  linhas: string[][];
};

export type LeituraDePlanilha =
  | { ok: true; abas: AbaDaPlanilha[] }
  | { ok: false; motivo: MotivoZipIlegivel | "nao_e_planilha" };

/** Aba de lista de contatos é pequena; o teto existe contra zip bomb. */
const LIMITE_DESCOMPRIMIDO = 40 * 1024 * 1024;

/** Mesmo teto da importação: acima disso não é lista, é base de dados. */
const MAXIMO_DE_LINHAS = 5_000;

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Alguns geradores (OpenXML SDK, exportações de CRM) escrevem as tags com
 * prefixo de namespace: `<x:row>`, `<x:c>`. Tirar o prefixo deixa uma regex
 * só servir aos dois.
 */
function semPrefixo(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1");
}

/** Todo `<t>` dentro do trecho, concatenado — cobre texto com formatação mista. */
function textoDasTags(trecho: string): string {
  let texto = "";
  for (const m of trecho.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) {
    texto += decodificarEntidades(m[1] ?? "");
  }
  return texto;
}

function lerTextosCompartilhados(xml: string): string[] {
  const textos: string[] = [];
  for (const m of semPrefixo(xml).matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    textos.push(textoDasTags(m[1] ?? ""));
  }
  return textos;
}

/** "C12" → 2. Letras em base 26 sem zero: A=1 … Z=26, AA=27. */
function indiceDaColuna(referencia: string): number | null {
  const letras = referencia.match(/^[A-Z]+/i)?.[0];
  if (!letras) return null;
  let indice = 0;
  for (const letra of letras.toUpperCase()) indice = indice * 26 + (letra.charCodeAt(0) - 64);
  return indice - 1;
}

function atributo(atributos: string, nome: string): string | null {
  return atributos.match(new RegExp(`\\b${nome}="([^"]*)"`))?.[1] ?? null;
}

/**
 * Telefone salvo como NÚMERO é o caso comum numa planilha de contatos — e o
 * Excel às vezes grava 13 dígitos em notação científica
 * ("5.5119912345670002E+12"). Lido como texto cru, o telefone viraria lixo.
 * Inteiros cabem com folga no `Number` (telefone tem no máximo 15 dígitos).
 */
function numeroComoTexto(valor: string): string {
  if (!/e/i.test(valor) && !/\.0+$/.test(valor)) return valor;
  const numero = Number(valor);
  if (Number.isFinite(numero) && Number.isInteger(numero) && Math.abs(numero) < 1e16) {
    return numero.toFixed(0);
  }
  return valor;
}

function valorDaCelula(atributos: string, corpo: string, compartilhados: string[]): string {
  const tipo = atributo(atributos, "t");
  if (tipo === "inlineStr") return textoDasTags(corpo);

  const bruto = corpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (bruto === undefined) return "";
  const valor = decodificarEntidades(bruto);

  if (tipo === "s") return compartilhados[Number(valor)] ?? "";
  if (tipo === "str" || tipo === "e" || tipo === "b") return valor;
  return numeroComoTexto(valor);
}

export function lerLinhasDaAba(xml: string, compartilhados: string[]): string[][] {
  const linhas: string[][] = [];
  const limpo = semPrefixo(xml);

  // Linha vazia vem como `<row r="3"/>`: o padrão tem de aceitar a forma
  // fechada, senão engoliria a linha seguinte até o próximo `</row>`.
  for (const linha of limpo.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celulas: string[] = [];
    let proxima = 0;

    for (const celula of (linha[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = celula[1] ?? "";
      const ref = atributo(atributos, "r");
      const indice = (ref ? indiceDaColuna(ref) : null) ?? proxima;
      while (celulas.length < indice) celulas.push("");
      celulas[indice] = valorDaCelula(atributos, celula[2] ?? "", compartilhados).trim();
      proxima = indice + 1;
    }

    if (celulas.some((c) => c !== "")) linhas.push(celulas);
    if (linhas.length >= MAXIMO_DE_LINHAS) break;
  }

  return linhas;
}

/**
 * A ordem das abas vem do `workbook.xml`, e o arquivo de cada uma vem do
 * `.rels` — `sheet1.xml` não é necessariamente a primeira aba que o corretor
 * vê, se alguém reordenou.
 */
function ordemDasAbas(arquivos: Map<string, string>): { nome: string; caminho: string }[] {
  const workbook = arquivos.get("xl/workbook.xml");
  const rels = arquivos.get("xl/_rels/workbook.xml.rels");

  if (workbook && rels) {
    const alvos = new Map<string, string>();
    for (const m of semPrefixo(rels).matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const id = atributo(m[1], "Id");
      const alvo = atributo(m[1], "Target");
      if (id && alvo) {
        const caminho = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
        alvos.set(id, caminho);
      }
    }

    const abas: { nome: string; caminho: string }[] = [];
    for (const m of semPrefixo(workbook).matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const id = m[1].match(/\b(?:r:)?id="([^"]*)"/)?.[1];
      const caminho = id ? alvos.get(id) : undefined;
      if (caminho && arquivos.has(caminho)) {
        abas.push({ nome: decodificarEntidades(atributo(m[1], "name") ?? ""), caminho });
      }
    }
    if (abas.length > 0) return abas;
  }

  // Sem o índice, a ordem dos nomes é o melhor palpite — e é a de quase todo arquivo.
  return [...arquivos.keys()]
    .filter((nome) => /^xl\/worksheets\/[^/]+\.xml$/.test(nome))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((caminho) => ({ nome: caminho.split("/").pop()!.replace(/\.xml$/, ""), caminho }));
}

export function lerPlanilhaXlsx(arquivo: Buffer): LeituraDePlanilha {
  const leitura = lerZip(arquivo, {
    aceitar: (nome) =>
      nome === "xl/workbook.xml" ||
      nome === "xl/_rels/workbook.xml.rels" ||
      nome === "xl/sharedStrings.xml" ||
      /^xl\/worksheets\/[^/]+\.xml$/.test(nome),
    limiteDescomprimido: LIMITE_DESCOMPRIMIDO,
  });
  if (!leitura.ok) return { ok: false, motivo: leitura.motivo };

  const arquivos = new Map(leitura.arquivos.map((a) => [a.nome, a.conteudo.toString("utf8")]));
  const abas = ordemDasAbas(arquivos);
  if (abas.length === 0) return { ok: false, motivo: "nao_e_planilha" };

  const compartilhados = lerTextosCompartilhados(arquivos.get("xl/sharedStrings.xml") ?? "");

  return {
    ok: true,
    abas: abas.map((aba) => ({
      nome: aba.nome,
      linhas: lerLinhasDaAba(arquivos.get(aba.caminho) ?? "", compartilhados),
    })),
  };
}
