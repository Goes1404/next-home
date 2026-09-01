import { describe, expect, it } from "vitest";
import { ordenarFila, TETO_DA_FILA, type ItemFila, type TipoItemFila } from "./filaDeTrabalho";

/**
 * A ordem da fila é a decisão de produto da tela inicial (roadmap F3): o que
 * some se ninguém agir hoje vem primeiro. Sem prova, um refactor reordena os
 * pesos sem ninguém notar — e o corretor passa a ver "revisar respostas da
 * IA" acima de uma visita marcada para daqui a duas horas.
 */

/*
 * A ordem esperada, escrita à mão de propósito: se este arquivo importasse
 * o PESO de produção, o teste passaria a concordar com qualquer reordenação
 * — inclusive a errada. É a segunda cópia que dá sentido à primeira.
 */
const PESOS: Record<TipoItemFila, number> = {
  sem_resposta: 0,
  visita_hoje: 1,
  tarefa_vencida: 2,
  lead_novo: 3,
  tarefa_hoje: 4,
  sem_revisao: 5,
  lead_parado: 6,
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

describe("nome e agrupamento na fila (27/08/2026)", () => {
  /*
   * Reprodução do que apareceu em produção: uma importação de dez leads sem
   * nome encheu as seis vagas com "Falar com Contato sem nome · Chegou
   * hoje" — seis pessoas diferentes, indistinguíveis, escondendo tudo o que
   * viesse depois.
   */
  it("sem nome utilizável, o TELEFONE vira a identidade", async () => {
    const { nomeParaExibir } = await import("@/lib/leads/nomeExibido");
    expect(nomeParaExibir({ nome: "Contato sem nome", telefone: "11.95721-6675" })).toBe(
      "(11) 95721-6675",
    );
    expect(nomeParaExibir({ nome: "  ", telefone: "5511995738920" })).toBe("(11) 99573-8920");
  });

  it("nome de verdade continua ganhando do telefone", async () => {
    const { nomeParaExibir } = await import("@/lib/leads/nomeExibido");
    expect(nomeParaExibir({ nome: "Priscila", telefone: "11957216675" })).toBe("Priscila");
  });

  it("sem nome E sem telefone, diz a verdade em vez de inventar", async () => {
    const { nomeParaExibir } = await import("@/lib/leads/nomeExibido");
    expect(nomeParaExibir({ nome: null, telefone: null })).toBe("Contato sem nome");
    // Número que não dá para remontar não vira identidade falsa.
    expect(nomeParaExibir({ nome: null, telefone: "123" })).toBe("Contato sem nome");
  });

  it("a fila agrupa a partir do terceiro item do mesmo tipo", async () => {
    const { INDIVIDUAIS_POR_TIPO } = await import("./filaDeTrabalho");
    // O teto de 6 não serve de nada se um assunto só puder ocupar os 6.
    expect(INDIVIDUAIS_POR_TIPO).toBeLessThan(6);
    expect(INDIVIDUAIS_POR_TIPO).toBeGreaterThan(1);
  });
});

describe("quem esperando resposta vem primeiro", () => {
  /*
   * A ordem da fila é a do CUSTO DE PERDER, e esta é a única situação em
   * que a pessoa já levantou a mão e nós ignoramos.
   *
   * Medido em 01/09, com a trava de campanha quebrada: 6 clientes
   * responderam ao disparo e nenhum recebeu resposta — um deles esperando
   * desde 27/08. A visita de hoje perde para isso porque já está marcada;
   * quem espera resposta desiste a qualquer momento.
   */
  it("ganha até da visita de hoje", () => {
    const item = (tipo: TipoItemFila): ItemFila => ({
      chave: tipo,
      tipo,
      titulo: tipo,
      detalhe: "",
      href: "/",
      peso: PESOS[tipo],
    });

    const ordenada = ordenarFila([
      item("lead_parado"),
      item("visita_hoje"),
      item("sem_resposta"),
      item("tarefa_vencida"),
    ]);

    expect(ordenada[0].tipo).toBe("sem_resposta");
    expect(ordenada[1].tipo).toBe("visita_hoje");
  });
});
