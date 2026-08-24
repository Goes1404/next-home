import { describe, expect, it } from "vitest";
import { ordenarFila, TETO_DA_FILA, type ItemFila, type TipoItemFila } from "./filaDeTrabalho";

/**
 * A ordem da fila é a decisão de produto da tela inicial (roadmap F3): o que
 * some se ninguém agir hoje vem primeiro. Sem prova, um refactor reordena os
 * pesos sem ninguém notar — e o corretor passa a ver "revisar respostas da
 * IA" acima de uma visita marcada para daqui a duas horas.
 */

const PESOS: Record<TipoItemFila, number> = {
  visita_hoje: 0,
  tarefa_vencida: 1,
  lead_novo: 2,
  tarefa_hoje: 3,
  sem_revisao: 4,
  lead_parado: 5,
};

// `titulo: string` explícito: sem a anotação, o default (`= tipo`) faz o TS
// inferir `TipoItemFila` e um título de verdade ("09h") vira erro de tipo —
// e o arquivo entra no `tsconfig`, ou seja, derruba o `next build`.
function item(tipo: TipoItemFila, titulo: string = tipo): ItemFila {
  return {
    chave: `${tipo}:${titulo}`,
    tipo,
    titulo,
    detalhe: "",
    href: "/corretor/leads",
    peso: PESOS[tipo],
  };
}

describe("ordem da fila de trabalho", () => {
  it("visita de hoje vem antes de tudo", () => {
    const ordenada = ordenarFila([
      item("lead_parado"),
      item("sem_revisao"),
      item("visita_hoje"),
      item("lead_novo"),
    ]);
    expect(ordenada[0].tipo).toBe("visita_hoje");
  });

  it("tarefa vencida vem antes de lead novo, e lead novo antes de tarefa de hoje", () => {
    const ordenada = ordenarFila([
      item("tarefa_hoje"),
      item("lead_novo"),
      item("tarefa_vencida"),
    ]);
    expect(ordenada.map((i) => i.tipo)).toEqual(["tarefa_vencida", "lead_novo", "tarefa_hoje"]);
  });

  it("rótulo de IA e lead parado ficam no fim — importam, mas esperam", () => {
    const ordenada = ordenarFila([
      item("lead_parado"),
      item("sem_revisao"),
      item("visita_hoje"),
    ]);
    expect(ordenada.map((i) => i.tipo)).toEqual(["visita_hoje", "sem_revisao", "lead_parado"]);
  });

  it("mantém a ordem de chegada dentro do mesmo peso (visita mais cedo primeiro)", () => {
    const ordenada = ordenarFila([
      item("visita_hoje", "09h"),
      item("visita_hoje", "14h"),
      item("visita_hoje", "18h"),
    ]);
    expect(ordenada.map((i) => i.titulo)).toEqual(["09h", "14h", "18h"]);
  });

  it("o teto mantém a fila legível — fila longa vira lista, e lista ninguém lê", () => {
    expect(TETO_DA_FILA).toBeLessThanOrEqual(6);
  });
});
