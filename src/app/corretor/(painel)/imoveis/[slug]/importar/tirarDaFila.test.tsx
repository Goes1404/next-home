import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";

/**
 * Relatado em 25/09: "na hora de inserir as imagens, não tem como tirá-las da
 * lista". Tocar na foto já alternava, mas nada mostrava que dava; e o envio
 * copiava a lista no clique, então desmarcar no meio não mudava nada.
 */

const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");

describe("o envio do site respeita o que foi tirado no meio", () => {
  const codigo = semComentarios(readFileSync(join(__dirname, "OrigemSite.tsx"), "utf8"));

  it("cada imagem confere a lista de AGORA antes de sair", () => {
    expect(codigo).toMatch(/const escolha = escolhasAgora\.current\[daFila\.chave\]/);
    expect(codigo).toMatch(/if \(parar\.current \|\| !escolha\.incluir\)/);
  });

  it("vídeos e tours também", () => {
    expect(codigo).toMatch(/if \(parar\.current \|\| !midiasAgora\.current\[midia\.url\]\)/);
  });
});

describe("o PDF e o Drive também", () => {
  const ler = (arquivo: string) => semComentarios(readFileSync(join(__dirname, arquivo), "utf8"));

  it("o PDF manda em lotes pequenos, conferindo a lista antes de cada um", () => {
    const codigo = ler("OrigemPdf.tsx");
    expect(codigo).toMatch(/const LOTE_PDF = [2-6];/);
    expect(codigo).toMatch(/\.map\(\(chave\) => escolhasAgora\.current\[chave\]\)/);
    expect(codigo).toMatch(/Boolean\(e\?\.incluir\) && !parar\.current/);
  });

  it("a action do PDF diz o desfecho de cada imagem, para a grade marcar uma a uma", () => {
    expect(ler("acoes.ts")).toMatch(/return \{ ok: true, gravadas, duplicadas, falhas, plantas, porItem \}/);
  });

  it("o Drive confere a lista na hora em que cada foto sai", () => {
    const codigo = ler("OrigemDrive.tsx");
    expect(codigo).toMatch(/const escolha = escolhasAgora\.current\[chave\];/);
    expect(codigo).toMatch(/if \(parar\.current \|\| !escolha\?\.incluir\)/);
  });
});

const escolha = (chave: string, incluir: boolean): EscolhaCuradoria => ({ chave, incluir, tipo: "foto", capa: false });
const item = (chave: string, estado?: ItemDaGrade["estado"]): ItemDaGrade => ({
  chave,
  preview: `https://x.test/${chave}.jpg`,
  legenda: chave,
  estado,
});

describe("a grade mostra como tirar", () => {
  const html = (itens: ItemDaGrade[], escolhas: Record<string, EscolhaCuradoria>) =>
    renderToStaticMarkup(<GradeCuradoria itens={itens} escolhas={escolhas} aoMudar={() => {}} />);

  it("marcada ganha o botão de tirar; desmarcada, o de colocar", () => {
    const saida = html([item("a"), item("b")], { a: escolha("a", true), b: escolha("b", false) });
    expect(saida).toContain("Tirar da lista");
    expect(saida).toContain("Colocar na lista");
    expect(saida).toContain("Fora da lista");
  });

  it("na fila, ainda dá para tirar", () => {
    expect(html([item("a", "fila")], { a: escolha("a", true) })).toContain("Tirar da fila");
  });

  it("enviando ou já entrou não oferece tirar", () => {
    const saida = html([item("a", "enviando"), item("b", "entrou")], {
      a: escolha("a", true),
      b: escolha("b", false),
    });
    expect(saida).not.toMatch(/Tirar da|Colocar na lista/);
    expect(saida).toContain("Enviando…");
    expect(saida).toContain("Entrou no imóvel");
  });
});
