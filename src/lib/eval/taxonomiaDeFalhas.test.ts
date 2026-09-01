import { describe, expect, it } from "vitest";
import {
  categoriaEhUtil,
  montarTaxonomia,
  naoCategorizadas,
  relatorio,
  type Anotacao,
  type Categoria,
} from "./taxonomiaDeFalhas";

const DEF = "Quando a assistente devolve uma pergunta de funil em vez de responder o que foi perguntado.";

const cat = (nome: string, definicao = DEF): Categoria => ({ nome, definicao });
const nota = (origem: string, turno: number, categoria?: string): Anotacao => ({
  origem,
  turno,
  nota: `algo em ${origem}`,
  categoria,
});

describe("montarTaxonomia", () => {
  it("ordena por CONVERSAS antes de ocorrências — padrão vence caso isolado", () => {
    /*
     * 8 ocorrências numa conversa só é um caso; 4 em 4 conversas é padrão.
     * Ordenar por total faria a equipe consertar o caso isolado primeiro —
     * a mesma lição da cascata de provedores: a unidade é a CONVERSA.
     */
    const anotacoes = [
      ...Array.from({ length: 8 }, (_, i) => nota("persona-a", i + 1, "loop")),
      ...["p1", "p2", "p3", "p4"].map((p) => nota(p, 1, "nao-respondeu")),
    ];

    const linhas = montarTaxonomia(anotacoes, [cat("loop"), cat("nao-respondeu")]);

    expect(linhas.map((l) => l.categoria)).toEqual(["nao-respondeu", "loop"]);
    expect(linhas[0].conversas).toBe(4);
    expect(linhas[1].ocorrencias).toBe(8);
  });

  it("calcula a fatia sobre o que foi CATEGORIZADO, não sobre tudo", () => {
    const anotacoes = [nota("a", 1, "x"), nota("b", 1, "x"), nota("c", 1)];
    const linhas = montarTaxonomia(anotacoes, [cat("x")]);
    expect(linhas[0].fatia).toBe(100);
  });

  it("guarda exemplos — número sem exemplo não se audita", () => {
    const linhas = montarTaxonomia([nota("a", 3, "x")], [cat("x")]);
    expect(linhas[0].exemplos[0]).toContain("a t3");
  });
});

describe("categoriaEhUtil", () => {
  it("recusa categoria sem definição de verdade", () => {
    // "resposta ruim" é opinião com aparência de dado.
    expect(categoriaEhUtil({ nome: "ruim", definicao: "tá ruim" }, [nota("a", 1, "ruim")])).toBe(
      false,
    );
  });

  it("recusa categoria que nunca ocorreu", () => {
    // Categoria vazia é hipótese minha, não achado dos dados.
    expect(categoriaEhUtil(cat("nunca-vista"), [nota("a", 1, "outra")])).toBe(false);
  });

  it("aceita categoria definida e observada", () => {
    expect(categoriaEhUtil(cat("x"), [nota("a", 1, "x")])).toBe(true);
  });
});

describe("naoCategorizadas e relatório", () => {
  it("a sobra aparece no relatório, não some num balde 'outros'", () => {
    const anotacoes = [nota("a", 1, "x"), nota("b", 2)];
    const texto = relatorio(
      montarTaxonomia(anotacoes, [cat("x")]),
      naoCategorizadas(anotacoes),
    );

    expect(texto).toContain("Fora da taxonomia (1)");
    expect(texto).toContain("b t2");
  });

  it("sem categoria útil, diz isso em vez de inventar relatório", () => {
    expect(relatorio([], [])).toMatch(/Nenhuma categoria/);
  });
});
