import { describe, expect, it } from "vitest";
import { agregarPorCampanha, type LeadDeAnuncio } from "./funilDeAnuncios";

const lead = (p: Partial<LeadDeAnuncio> & { id: string }): LeadDeAnuncio => ({
  metaCampanhaId: null,
  visitaAgendadaEm: null,
  etapa: "novo",
  ...p,
});

describe("agregarPorCampanha", () => {
  it("junta gasto e leads pelo ID da campanha", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [{ campanhaId: "120", nome: "Manacá — tráfego", gasto: 300 }],
      leads: [
        lead({ id: "a", metaCampanhaId: "120" }),
        lead({ id: "b", metaCampanhaId: "120", visitaAgendadaEm: "2026-09-02T14:00:00Z" }),
        lead({ id: "c", metaCampanhaId: "120", etapa: "fechado" }),
      ],
      dossies: [{ leadId: "b", temperaturaLabel: "quente" }],
    });

    expect(campanhas[0]).toMatchObject({
      nome: "Manacá — tráfego",
      gasto: 300,
      leads: 3,
      visitas: 1,
      fechados: 1,
      quentes: 1,
      custoPorLead: 100,
      custoPorVisita: 300,
      custoPorFechado: 300,
      custoPorQuente: 300,
    });
  });

  /*
   * O caso que mais importa numa tela de custo, e o que some se a lista
   * for montada a partir dos leads: dinheiro saindo sem lead entrando.
   */
  it("mostra campanha que gastou e não trouxe ninguém", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [{ campanhaId: "999", nome: "Vitra — vídeo", gasto: 450 }],
      leads: [],
      dossies: [],
    });

    expect(campanhas).toHaveLength(1);
    expect(campanhas[0]).toMatchObject({ gasto: 450, leads: 0, custoPorLead: null });
  });

  /*
   * O inverso: o gasto pode ter acontecido antes da janela de 30 dias.
   * Sumir com o lead porque não há linha de gasto seria perder atribuição
   * verdadeira.
   */
  it("mostra campanha com lead e sem gasto na janela", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [],
      leads: [lead({ id: "a", metaCampanhaId: "77" })],
      dossies: [],
    });

    expect(campanhas[0]).toMatchObject({ campanhaId: "77", gasto: 0, leads: 1 });
  });

  /*
   * A honestidade da tabela. Hoje é a maioria por construção: o formato que
   * o cliente usa é Click-to-WhatsApp, que entra pelo link porteiro e nasce
   * sem `meta_campanha_id`.
   */
  it("conta à parte quem veio de anúncio sem campanha identificada", () => {
    const { campanhas, naoAtribuidos } = agregarPorCampanha({
      gastos: [{ campanhaId: "120", nome: "Manacá", gasto: 100 }],
      leads: [lead({ id: "a", metaCampanhaId: "120" }), lead({ id: "b" }), lead({ id: "c" })],
      dossies: [],
    });

    expect(naoAtribuidos).toBe(2);
    // E não vazam para dentro de nenhuma campanha.
    expect(campanhas.reduce((s, c) => s + c.leads, 0)).toBe(1);
  });

  it("divisão por zero vira null, nunca Infinity na tela", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [{ campanhaId: "1", nome: "X", gasto: 200 }],
      leads: [lead({ id: "a", metaCampanhaId: "1" })],
      dossies: [],
    });

    expect(campanhas[0].custoPorLead).toBe(200);
    expect(campanhas[0].custoPorVisita).toBeNull();
    expect(campanhas[0].custoPorFechado).toBeNull();
    expect(campanhas[0].custoPorQuente).toBeNull();
  });

  it("soma os dias da mesma campanha", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [
        { campanhaId: "1", nome: "X", gasto: 100 },
        { campanhaId: "1", nome: "X", gasto: 50.5 },
      ],
      leads: [],
      dossies: [],
    });

    expect(campanhas[0].gasto).toBe(150.5);
  });

  it("ordena por gasto — a tela é sobre para onde o dinheiro foi", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [
        { campanhaId: "1", nome: "Pequena", gasto: 10 },
        { campanhaId: "2", nome: "Grande", gasto: 900 },
      ],
      leads: [],
      dossies: [],
    });

    expect(campanhas.map((c) => c.nome)).toEqual(["Grande", "Pequena"]);
  });

  /*
   * Só `quente` conta como quente. Um dossiê morno ou frio não pode inflar
   * o denominador do custo por lead quente — seria baratear na conta o que
   * não ficou barato na vida.
   */
  it("só a temperatura quente conta para o custo por quente", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [{ campanhaId: "1", nome: "X", gasto: 300 }],
      leads: [
        lead({ id: "a", metaCampanhaId: "1" }),
        lead({ id: "b", metaCampanhaId: "1" }),
        lead({ id: "c", metaCampanhaId: "1" }),
      ],
      dossies: [
        { leadId: "a", temperaturaLabel: "quente" },
        { leadId: "b", temperaturaLabel: "morno" },
        { leadId: "c", temperaturaLabel: null },
      ],
    });

    expect(campanhas[0].quentes).toBe(1);
    expect(campanhas[0].custoPorQuente).toBe(300);
  });

  it("base vazia devolve tabela vazia, não linha fantasma", () => {
    expect(agregarPorCampanha({ gastos: [], leads: [], dossies: [] })).toEqual({
      campanhas: [],
      naoAtribuidos: 0,
    });
  });
});
