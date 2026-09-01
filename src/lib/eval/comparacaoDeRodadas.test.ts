import { describe, expect, it } from "vitest";
import {
  compararMetrica,
  compararRodadas,
  mediana,
  METRICAS,
  type Metrica,
} from "./comparacaoDeRodadas";

const MENOR: Metrica = { chave: "x", rotulo: "x", melhorQuando: "menor" };
const MAIOR: Metrica = { chave: "y", rotulo: "y", melhorQuando: "maior" };

describe("compararMetrica", () => {
  it("só declara avanço quando as faixas não se tocam", () => {
    // pior rodada do depois (9) ainda ganha da melhor do antes (12)
    expect(compararMetrica(MENOR, [12, 14, 15], [7, 8, 9]).veredito).toBe("melhorou");
  });

  it("faixas que se sobrepõem são EMPATE, mesmo com medianas diferentes", () => {
    /*
     * O caso que motivou o módulo: v26 → v27 deu 12 → 15 no total de
     * repetições e eu li como piora. Com rodadas, 12 e 15 podem ser duas
     * amostras da mesma distribuição — e declarar piora manda consertar o
     * que não quebrou.
     */
    const c = compararMetrica(MENOR, [12, 16, 11], [15, 10, 14]);
    expect(c.veredito).toBe("empate");
    expect(c.diferenca).toBeNull();
    expect(mediana(c.antes)).not.toBe(mediana(c.depois));
  });

  it("respeita a direção da métrica", () => {
    expect(compararMetrica(MAIOR, [0, 0, 1], [3, 4, 4]).veredito).toBe("melhorou");
    expect(compararMetrica(MAIOR, [3, 4, 4], [0, 0, 1]).veredito).toBe("piorou");
  });

  it("uma rodada de cada lado não decide nada", () => {
    // É exatamente o que eu vinha fazendo da v25 à v28.
    expect(compararMetrica(MENOR, [12], [15]).veredito).toBe("sem_dados");
  });
});

describe("compararRodadas", () => {
  const antes = [
    { clienteRepetiu: 12, iaRepetiu: 3, respostasRepetidas: 0, maiorSequenciaSemNovidade: 8, avancou: 1, assumiria: 1, mesmaPessoa: 2 },
    { clienteRepetiu: 13, iaRepetiu: 3, respostasRepetidas: 1, maiorSequenciaSemNovidade: 9, avancou: 1, assumiria: 1, mesmaPessoa: 2 },
    { clienteRepetiu: 14, iaRepetiu: 4, respostasRepetidas: 0, maiorSequenciaSemNovidade: 8, avancou: 0, assumiria: 1, mesmaPessoa: 2 },
  ];

  it("chama de empate quando nada sai da faixa", () => {
    const r = compararRodadas(antes, antes, { juizDecide: true });
    expect(r.conclusao).toMatch(/EMPATE/);
  });

  it("declara avanço quando a determinística sai da faixa e nada piora", () => {
    const depois = antes.map((r) => ({ ...r, clienteRepetiu: r.clienteRepetiu - 8 }));
    const r = compararRodadas(antes, depois, { juizDecide: true });
    expect(r.conclusao).toMatch(/AVANÇO/);
    expect(r.conclusao).toContain("o cliente teve de repetir");
  });

  it("juiz não independente NÃO decide — só as determinísticas contam", () => {
    /*
     * O caso de hoje: uma chave só, juiz e agente na OpenAI. A nota segue
     * útil como descrição; usá-la como decisão foi o que me fez ler
     * "assumiria 1/4 → 0/4" como medida.
     */
    const depois = antes.map((r) => ({ ...r, avancou: 4, assumiria: 4 }));

    expect(compararRodadas(antes, depois, { juizDecide: true }).conclusao).toMatch(/AVANÇO/);
    expect(compararRodadas(antes, depois, { juizDecide: false }).conclusao).toMatch(/EMPATE/);
  });

  it("melhora numa e piora noutra é TROCA, não avanço", () => {
    const depois = antes.map((r) => ({
      ...r,
      clienteRepetiu: r.clienteRepetiu - 8,
      maiorSequenciaSemNovidade: r.maiorSequenciaSemNovidade + 5,
    }));
    const r = compararRodadas(antes, depois, { juizDecide: true });
    expect(r.conclusao).toMatch(/TROCA/);
  });
});

describe("METRICAS", () => {
  it("as determinísticas vêm antes das do juiz", () => {
    const primeiraDoJuiz = METRICAS.findIndex((m) => m.doJuiz);
    const ultimaDeterministica = METRICAS.map((m) => Boolean(m.doJuiz)).lastIndexOf(false);
    expect(ultimaDeterministica).toBeLessThan(primeiraDoJuiz);
  });
});
