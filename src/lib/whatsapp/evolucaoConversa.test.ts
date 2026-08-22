import { describe, expect, it } from "vitest";
import {
  CARENCIA_AVISO_MINUTOS,
  detectarEvolucao,
  faixaDaTemperatura,
  podeAvisarAgora,
} from "./evolucaoConversa";
import type { DossieClienteIA } from "./types";

const moeda = (v: number | null) => (v === null ? "—" : `R$ ${v.toLocaleString("pt-BR")}`);

function dossie(p: Partial<DossieClienteIA> & { temperaturaScore: number }): DossieClienteIA {
  return {
    id: "d", leadId: "l",
    orcamentoMin: null, orcamentoMax: null,
    formaPagamento: null, perfilFamiliar: null, urgenciaMudanca: null,
    exigenciasEspecificas: [], objecoesIdentificadas: [],
    temperaturaLabel: faixaDaTemperatura(p.temperaturaScore),
    resumoExecutivo: "", proximoPassoSugerido: null,
    createdAt: "", updatedAt: "",
    ...p,
  } as DossieClienteIA;
}

describe("O que conta como evolução da conversa", () => {
  it("oscilação do score na mesma faixa NÃO avisa", () => {
    // O caso que enchia o WhatsApp do corretor: o dossiê é reextraído a cada
    // mensagem e o score balança sozinho, sem o cliente ter dito nada novo.
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 42 }),
      novo: dossie({ temperaturaScore: 38 }),
      formatarMoeda: moeda,
    });
    expect(r).toBeNull();
  });

  it("cruzar o limiar de raspão NÃO avisa — precisa de folga", () => {
    // 39 → 41 muda de faixa no papel, mas é ruído do modelo. Sem a margem,
    // um cliente parado no limiar geraria aviso a cada mensagem.
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 39 }),
      novo: dossie({ temperaturaScore: 41 }),
      formatarMoeda: moeda,
    });
    expect(r).toBeNull();
  });

  it("subida de faixa com folga AVISA", () => {
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 35 }),
      novo: dossie({ temperaturaScore: 58 }),
      formatarMoeda: moeda,
    });
    expect(r?.linhas[0]).toContain("morno");
    expect(r?.urgente).toBe(false);
  });

  it("virar QUENTE é urgente e fura a carência", () => {
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 50 }),
      novo: dossie({ temperaturaScore: 88 }),
      formatarMoeda: moeda,
    });
    expect(r?.urgente).toBe(true);
  });

  it("esfriar NÃO avisa — não é notícia acionável", () => {
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 90 }),
      novo: dossie({ temperaturaScore: 20 }),
      formatarMoeda: moeda,
    });
    expect(r).toBeNull();
  });

  it("orçamento descoberto pela primeira vez avisa; reestimativa não", () => {
    const primeiro = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 30 }),
      novo: dossie({ temperaturaScore: 30, orcamentoMin: 500000, orcamentoMax: 700000 }),
      formatarMoeda: moeda,
    });
    expect(primeiro?.linhas.some((l) => l.includes("Orçamento"))).toBe(true);

    const reestimativa = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 30, orcamentoMin: 500000 }),
      novo: dossie({ temperaturaScore: 30, orcamentoMin: 520000 }),
      formatarMoeda: moeda,
    });
    expect(reestimativa).toBeNull();
  });

  it("a MESMA objeção escrita diferente não conta como nova", () => {
    // A IA reescreve: "preco" numa leitura, "Preço" na seguinte.
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 30, objecoesIdentificadas: ["preco"] }),
      novo: dossie({ temperaturaScore: 30, objecoesIdentificadas: ["Preço", "PREÇO "] }),
      formatarMoeda: moeda,
    });
    expect(r).toBeNull();
  });

  it("objeção realmente nova avisa", () => {
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 30, objecoesIdentificadas: ["preco"] }),
      novo: dossie({ temperaturaScore: 30, objecoesIdentificadas: ["preco", "prazo_entrega"] }),
      formatarMoeda: moeda,
    });
    expect(r?.linhas.some((l) => l.includes("prazo entrega"))).toBe(true);
  });

  it("visita confirmada é sempre urgente", () => {
    const r = detectarEvolucao({
      anterior: dossie({ temperaturaScore: 30 }),
      novo: dossie({ temperaturaScore: 30 }),
      visitaConfirmada: true,
      formatarMoeda: moeda,
    });
    expect(r?.urgente).toBe(true);
    expect(r?.linhas[0]).toContain("Visita confirmada");
  });

  it("primeira leitura fria não avisa; primeira leitura quente sim", () => {
    expect(
      detectarEvolucao({ anterior: null, novo: dossie({ temperaturaScore: 20 }), formatarMoeda: moeda }),
    ).toBeNull();
    expect(
      detectarEvolucao({ anterior: null, novo: dossie({ temperaturaScore: 85 }), formatarMoeda: moeda })?.urgente,
    ).toBe(true);
  });
});

describe("Carência entre avisos", () => {
  const agora = new Date(2026, 7, 22, 15, 0);

  it("aviso comum espera a carência", () => {
    const recem = new Date(agora.getTime() - 10 * 60_000);
    expect(podeAvisarAgora(recem, false, agora)).toBe(false);
  });

  it("passada a carência, avisa", () => {
    const antigo = new Date(agora.getTime() - (CARENCIA_AVISO_MINUTOS + 1) * 60_000);
    expect(podeAvisarAgora(antigo, false, agora)).toBe(true);
  });

  it("urgente fura a carência", () => {
    const recem = new Date(agora.getTime() - 60_000);
    expect(podeAvisarAgora(recem, true, agora)).toBe(true);
  });

  it("primeiro aviso da conversa sempre passa", () => {
    expect(podeAvisarAgora(null, false, agora)).toBe(true);
  });
});
