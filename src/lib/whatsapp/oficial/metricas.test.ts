import { describe, expect, it } from "vitest";
import { portaoDoPiloto, resumirLista, type ItemDaMedicao } from "./metricas";

const base: ItemDaMedicao = {
  status: "enviado",
  leadId: null,
  enviadoEm: "2026-11-03T12:00:00Z",
  entregueEm: null,
  lidoEm: null,
  erroMotivo: null,
  cobrada: null,
  categoria: null,
};

const tarifa = (c: string) => (c === "marketing" ? 0.32 : c === "utility" ? 0.035 : 0);

describe("medição do piloto", () => {
  it("conta o funil, o custo cobrado e o estimado, e as taxas", () => {
    const itens: ItemDaMedicao[] = [
      { ...base, leadId: "a", entregueEm: "x", lidoEm: "x", status: "respondido", cobrada: true, categoria: "marketing" },
      { ...base, leadId: "b", entregueEm: "x", cobrada: true, categoria: "marketing" },
      { ...base, leadId: "c" }, // sem webhook ainda: estimado
      { ...base, leadId: "d", cobrada: false, categoria: "marketing" }, // janela grátis do anúncio
      { ...base, leadId: "e", status: "erro", erroMotivo: "sem WhatsApp" },
      { ...base, leadId: "f", status: "erro", erroMotivo: "sem WhatsApp" },
      { ...base, leadId: "g", status: "erro", erroMotivo: "Sem consentimento" },
      { ...base, leadId: "h", status: "pendente", enviadoEm: null },
    ];
    const r = resumirLista(itens, { pararam: new Set(["b", "z"]), comVisita: new Set(["a"]), tarifa });
    expect(r).toMatchObject({
      enviadas: 4,
      entregues: 2,
      lidas: 1,
      respondidas: 1,
      pararam: 1, // "z" não recebeu esta lista
      visitas: 1,
      pendentes: 1,
      custo: 0.96,
      custoEstimado: true,
      custoPorResposta: 0.96,
      custoPorVisita: 0.96,
      taxaDeResposta: 0.25,
    });
    expect(r.falhas).toEqual([
      { motivo: "sem WhatsApp", total: 2 },
      { motivo: "Sem consentimento", total: 1 },
    ]);
  });

  it("lista sem envio: taxas nulas, sem divisão por zero", () => {
    const r = resumirLista([{ ...base, status: "pendente" }], { pararam: new Set(), comVisita: new Set(), tarifa });
    expect(r.taxaDeResposta).toBeNull();
    expect(r.custoPorResposta).toBeNull();
    expect(r.custoPorVisita).toBeNull();
  });

  it("o portão da F5: qualidade verde, nenhum modelo pausado e lista medida", () => {
    expect(portaoDoPiloto({ qualidade: "GREEN", modelosPausados: 0, taxaOficial: 0.2, taxaEvolution: 0.1 }).passou).toBe(true);
    const reprovado = portaoDoPiloto({ qualidade: "YELLOW", modelosPausados: 1, taxaOficial: null, taxaEvolution: 0.1 });
    expect(reprovado.passou).toBe(false);
    expect(reprovado.motivos).toHaveLength(3);
  });
});
