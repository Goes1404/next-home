import { describe, expect, it } from "vitest";
import {
  ETAPAS_DO_CAMINHO,
  ETAPAS_FUNIL,
  ETAPA_LABEL,
  PROXIMA_ETAPA,
  type EtapaFunil,
} from "@/lib/types";

/**
 * O caminho do funil é a regra de produto mais visível do painel: é o que o
 * botão de um toque executa, o que a barra de passos desenha e o que as
 * colunas do quadro mostram. Uma etapa a mais aqui é um clique a mais na
 * vida do corretor, todo dia.
 */

describe("o caminho do funil", () => {
  it("tem cinco passos — mais que isso vira processo, não venda", () => {
    expect(ETAPAS_DO_CAMINHO).toHaveLength(5);
  });

  it("perdido existe, mas fora do caminho: é a saída, não um passo", () => {
    expect(ETAPAS_FUNIL).toContain("perdido");
    expect(ETAPAS_DO_CAMINHO as readonly string[]).not.toContain("perdido");
  });

  it("todo passo do caminho tem rótulo em português de corretor", () => {
    for (const etapa of ETAPAS_FUNIL) {
      expect(ETAPA_LABEL[etapa]).toBeTruthy();
      // Nome de coluna de banco não chega à tela.
      expect(ETAPA_LABEL[etapa]).not.toContain("_");
    }
  });
});

describe("o botão de um toque", () => {
  it("leva sempre ao passo SEGUINTE do caminho, nunca para trás nem pulando", () => {
    for (let i = 0; i < ETAPAS_DO_CAMINHO.length - 1; i += 1) {
      const atual = ETAPAS_DO_CAMINHO[i];
      const seguinte = ETAPAS_DO_CAMINHO[i + 1];
      expect(PROXIMA_ETAPA[atual]?.etapa).toBe(seguinte);
    }
  });

  it("não existe em quem já saiu do jogo — botão ali seria armadilha", () => {
    expect(PROXIMA_ETAPA.fechado).toBeNull();
    expect(PROXIMA_ETAPA.perdido).toBeNull();
  });

  it("o rótulo é o ATO do corretor, não o nome do destino", () => {
    // "Falei com ele", não "mover para primeiro contato": quem vende pensa
    // no que acabou de fazer, não em mover cartão.
    for (const etapa of ETAPAS_FUNIL) {
      const proxima = PROXIMA_ETAPA[etapa];
      if (!proxima) continue;
      expect(proxima.acao).not.toContain("Mover");
      expect(proxima.acao).not.toBe(ETAPA_LABEL[proxima.etapa]);
    }
  });

  it("de qualquer etapa do caminho, o fim é alcançável só apertando o botão", () => {
    // A prova de que o caminho não tem buraco: partindo do começo e sempre
    // avançando, chega-se a "fechado" em no máximo quatro toques.
    let etapa: EtapaFunil = "novo";
    let toques = 0;
    while (PROXIMA_ETAPA[etapa] && toques < 10) {
      etapa = PROXIMA_ETAPA[etapa]!.etapa;
      toques += 1;
    }
    expect(etapa).toBe("fechado");
    expect(toques).toBe(4);
  });
});
