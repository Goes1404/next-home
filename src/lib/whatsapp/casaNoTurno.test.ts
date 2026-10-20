import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/grupos/codigoFonte";

/**
 * O turno passa a casa do grupo a TODA leitura do índice de foco (fase 4).
 *
 * Esquecer uma chamada não quebra nada no grupo 1 — a marca do site é a da
 * Next Home — e trava o foco num imóvel no dia em que outro grupo tiver no
 * catálogo um imóvel com a palavra do nome dele. A regressão é calada, por
 * isso a guarda lê o código.
 */
const codigo = semComentarios(readFileSync(join(__dirname, "turnoDeAtendimento.ts"), "utf8"));

function chamadas(nome: string): string[] {
  const achadas: string[] = [];
  const re = new RegExp(`\\b${nome}\\(`, "g");
  for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < codigo.length && profundidade > 0) {
      if (codigo[i] === "(") profundidade++;
      else if (codigo[i] === ")") profundidade--;
      i++;
    }
    achadas.push(codigo.slice(m.index, i));
  }
  return achadas;
}

describe("o turno usa a casa do grupo no índice de foco", () => {
  for (const nome of ["imoveisCitados", "palpiteDeNome", "removerIndicacaoPrematura", "catalogoParaAtendimento"]) {
    it(`${nome} recebe a casa do grupo`, () => {
      const lista = chamadas(nome);
      expect(lista.length).toBeGreaterThan(0);
      for (const chamada of lista) {
        // A casa inteira, não só o nome: a região também sai do índice.
        expect(chamada).toMatch(/[,{(]\s*casa\s*[,)}]/);
        expect(chamada).not.toContain("casa.nomeDaCasa");
      }
    });
  }

  it("a pergunta de região do planner e da qualificação recebe a casa", () => {
    for (const nome of ["blocoDaJogada", "blocoDeQualificacao"]) {
      const lista = chamadas(nome);
      expect(lista.length).toBeGreaterThan(0);
      for (const chamada of lista) expect(chamada).toMatch(/\bcasa\b/);
    }
  });

  it("nome e tom passam pela precedência grupo × instância", () => {
    expect(codigo).toMatch(/assistenteDaConversa\(pedido\.identidade, pedido\.identidade\.casa\)/);
    expect(codigo).not.toMatch(/pedido\.identidade\.(nomeAssistente|tomVoz)/);
  });
});
