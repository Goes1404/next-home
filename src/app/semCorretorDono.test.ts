import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte: o site público não monta link de WhatsApp por
 * conta própria, e o imóvel não carrega corretor dono.
 *
 * A regressão seria calada: o botão funcionaria, a conversa abriria, e só o
 * CRM não veria nada — o número de destino não estaria conectado ao sistema
 * e a mensagem não seria a que o porteiro reconhece. Medido em 28/09/2026:
 * 14 dos 18 imóveis com dono apontavam para um corretor sem número
 * conectado.
 *
 * Exceções declaradas, e por quê:
 * - página e cartão do CORRETOR: o visitante escolheu aquela pessoa;
 * - páginas por token (portal, proposta, seleção, documentos): quem abre já
 *   é lead, e fala com o corretor que o atende.
 */
const RAIZES = ["src/components", "src/app/(vitrine)", "src/app/(institucional)"].map((r) =>
  path.join(process.cwd(), r),
);

const EXCECOES = [
  "src/components/corretores/CardCorretor.tsx",
  "src/app/(institucional)/corretores/[slug]/page.tsx",
  "src/app/(institucional)/portal/[token]/page.tsx",
  "src/app/(institucional)/proposta/[token]/page.tsx",
  "src/app/(institucional)/selecao/[token]/page.tsx",
  "src/app/(institucional)/documentos/[token]/page.tsx",
  // O pixel só RECONHECE o clique num link wa.me (para o evento Lead); não monta link.
  "src/components/analytics/pixelMeta.ts",
];

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /[.]tsx?$/.test(e.name) && !/[.]test[.]/.test(e.name) ? [p] : [];
  });
}

/** Comentário que CITA o padrão não é uso dele. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

const relativo = (arq: string) => path.relative(process.cwd(), arq).split(path.sep).join("/");

describe("sem corretor dono no site público", () => {
  const todos = RAIZES.flatMap(arquivos);

  it("a varredura encontra arquivos", () => {
    // Varredura que para de achar arquivo aprova tudo calada.
    expect(todos.length).toBeGreaterThan(50);
  });

  it("nenhum arquivo fora das exceções monta wa.me ou linkWhatsappPara", () => {
    const culpados = todos
      .map(relativo)
      .filter((rel) => !EXCECOES.includes(rel))
      .filter((rel) => {
        const fonte = semComentarios(fs.readFileSync(rel, "utf8"));
        return fonte.includes("wa.me") || fonte.includes("linkWhatsappPara(");
      });
    expect(culpados).toEqual([]);
  });

  it("nenhum arquivo lê o corretor do imóvel", () => {
    const culpados = todos
      .map(relativo)
      .filter((rel) => /\b(e|imovel|empreendimento)\.corretor\b/.test(semComentarios(fs.readFileSync(rel, "utf8"))));
    expect(culpados).toEqual([]);
  });

  it("as exceções existem (senão a lista vira comentário morto)", () => {
    for (const rel of EXCECOES) expect(fs.existsSync(rel), rel).toBe(true);
  });
});
