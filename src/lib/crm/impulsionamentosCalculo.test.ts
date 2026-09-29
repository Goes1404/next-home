import { describe, expect, it } from "vitest";
import {
  lerValorEmReais,
  resumirImpulsionamentos,
  totaisDosImpulsionamentos,
  type LinhaImpulsionamento,
} from "./impulsionamentosCalculo";
import { TITULO_SEM_ETIQUETA } from "@/lib/whatsapp/anuncioMeta";

const base = { url: null, empreendimentoId: null, primeiroLeadEm: "2026-09-01", ultimoLeadEm: "2026-09-02" };
const A: LinhaImpulsionamento = { ...base, id: "1", corretorId: "c1", chave: "111", titulo: "Post A", valorGasto: 100 };
const B: LinhaImpulsionamento = { ...base, id: "2", corretorId: "c1", chave: "sem-etiqueta", titulo: null, valorGasto: null };
const lead = (o: Partial<{ corretorId: string; metaAdId: string | null; anuncioOrigem: string | null; etapa: string; visitaAgendadaEm: string | null }>) => ({
  corretorId: "c1",
  metaAdId: null,
  anuncioOrigem: null,
  etapa: "novo",
  visitaAgendadaEm: null,
  ...o,
});

describe("resumirImpulsionamentos", () => {
  const leads = [
    lead({ metaAdId: "111" }),
    lead({ metaAdId: "111", etapa: "documentacao" }),
    lead({ metaAdId: "111", visitaAgendadaEm: "2026-09-05" }),
    lead({ metaAdId: "111", corretorId: "c2" }), // outro corretor: não conta
    lead({ anuncioOrigem: TITULO_SEM_ETIQUETA }),
    lead({ anuncioOrigem: "Manacá" }), // link porteiro, não é impulsionamento
  ];
  const [ra, rb] = resumirImpulsionamentos([A, B], leads);

  it("conta pelo id do anúncio e só do dono", () => {
    expect(ra).toMatchObject({ leads: 3, visitas: 2, fechados: 0, custoPorLead: 33.33, custoPorVisita: 50 });
  });

  it("sem etiqueta junta só os leads do texto padrão", () => {
    expect(rb).toMatchObject({ leads: 1, custoPorLead: null });
  });

  it("totais só somam custo de quem informou gasto", () => {
    expect(totaisDosImpulsionamentos([ra, rb])).toMatchObject({
      anuncios: 2,
      semGasto: 1,
      gasto: 100,
      leads: 4,
      custoPorLead: 33.33,
    });
  });
});

describe("lerValorEmReais", () => {
  it.each([
    ["50", 50],
    ["R$ 49,90", 49.9],
    ["1.250,90", 1250.9],
    ["1.250", 1250],
    ["12.5", 12.5],
  ])("%s → %s", (e, v) => expect(lerValorEmReais(e)).toBe(v));

  it("vazio apaga", () => expect(lerValorEmReais("  ")).toBeNull());
  it("texto não é valor", () => expect(lerValorEmReais("cinquenta")).toBeNaN());
});
