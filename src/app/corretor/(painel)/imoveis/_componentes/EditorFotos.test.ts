import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Guarda de código-fonte, da família de `gravacaoDeMensagem.test.ts`.
 *
 * Até 24/09/2026 o botão "Definir Capa" só reordenava a TELA: a action
 * `definirFotoComoCapa` era importada e nenhum handler a chamava, então a capa
 * antiga voltava no reload. Build, tipo e teste passavam — import sem uso não
 * é erro. A regressão é calada, e por isso a guarda lê o arquivo.
 */

const fonte = readFileSync(join(__dirname, "EditorFotos.tsx"), "utf8")
  // Comentário explica o defeito citando o nome da action; não pode contar
  // como chamada.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function corpoDo(handler: string): string {
  const inicio = fonte.indexOf(`const ${handler} = async`);
  expect(inicio, `${handler} sumiu do EditorFotos`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n  };\n", inicio);
  return fonte.slice(inicio, fim);
}

describe("EditorFotos — as ações de cada cartão chegam ao servidor", () => {
  it("Definir Capa chama definirFotoComoCapa antes de reordenar a tela", () => {
    const corpo = corpoDo("handleDefinirCapa");
    const chamada = corpo.indexOf("definirFotoComoCapa(");
    const reordena = corpo.indexOf("setMidias(");
    expect(chamada).toBeGreaterThan(-1);
    expect(reordena).toBeGreaterThan(chamada);
  });

  it("É planta / É foto chama definirTipoDaMidia antes de mudar o selo", () => {
    const corpo = corpoDo("handleTrocarTipo");
    const chamada = corpo.indexOf("definirTipoDaMidia(");
    const muda = corpo.indexOf("setMidias(");
    expect(chamada).toBeGreaterThan(-1);
    expect(muda).toBeGreaterThan(chamada);
  });

  it("Salvar ordem só marca a sequência como salva depois do servidor confirmar", () => {
    const inicio = fonte.indexOf("const salvarOrdem = async");
    expect(inicio).toBeGreaterThan(-1);
    const corpo = fonte.slice(inicio, fonte.indexOf("\n  };\n", inicio));
    const chamada = corpo.indexOf("salvarOrdemDasFotos(");
    const marca = corpo.indexOf("setOrdemSalva(");
    expect(chamada).toBeGreaterThan(-1);
    expect(marca).toBeGreaterThan(chamada);
    expect(corpo.slice(chamada, marca)).toMatch(/if \(!res\.ok\)[\s\S]*?return;/);
  });

  it("a capa é a primeira FOTO, nunca a primeira imagem da lista", () => {
    expect(fonte).toMatch(/find\(\(m\) => m\.tipo === "foto"\)/);
    expect(fonte).not.toMatch(/ehCapa = index === 0/);
  });
});
