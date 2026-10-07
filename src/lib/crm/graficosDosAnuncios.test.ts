import { describe, expect, it } from "vitest";
import {
  clientesPorSemana,
  porCanal,
  resumirImpulsionamentos,
  type LinhaImpulsionamento,
} from "./impulsionamentosCalculo";

const base = { url: null, empreendimentoId: null, primeiroLeadEm: "2026-09-01", ultimoLeadEm: "2026-09-02", corretorId: "c1" };
const campanha = (id: string, canal: LinhaImpulsionamento["canal"], valorGasto: number | null): LinhaImpulsionamento => ({
  ...base, id, chave: `manual:${id}`, titulo: id, valorGasto, criadaPeloCorretor: true, canal,
});
const lead = (impulsionamentoId: string, criadoEm: string, etapa = "novo") => ({
  id: `${impulsionamentoId}-${criadoEm}-${etapa}`,
  corretorId: "c1", metaAdId: null, anuncioOrigem: null, etapa, visitaAgendadaEm: null, impulsionamentoId, criadoEm,
});

const resumos = resumirImpulsionamentos(
  [campanha("ig", "instagram", 600), campanha("gg", "google", 400), campanha("zap", "portal", null)],
  [
    lead("ig", "2026-10-06T15:00:00Z"),
    lead("ig", "2026-10-01T15:00:00Z", "visitou"),
    lead("ig", "2026-09-20T15:00:00Z"),
    lead("gg", "2026-10-05T15:00:00Z"),
    lead("zap", "2026-10-04T15:00:00Z"),
  ],
);

describe("porCanal", () => {
  const linhas = porCanal(resumos);
  it("só conta campanha com gasto, e as partes somam 100", () => {
    expect(linhas.map((l) => l.canal)).toEqual(["instagram", "google"]);
    expect(linhas[0]).toMatchObject({ gasto: 600, clientes: 3, visitas: 1, parteDoGasto: 60, parteDosClientes: 75, custoPorCliente: 200 });
    expect(linhas[1]).toMatchObject({ parteDoGasto: 40, parteDosClientes: 25, custoPorCliente: 400 });
  });
  it("anúncio detectado sem canal é da Meta", () => {
    const [r] = resumirImpulsionamentos([{ ...base, id: "a", chave: "999", titulo: null, valorGasto: 50 }], []);
    expect(porCanal([r])[0].rotulo).toBe("Instagram/Facebook");
  });
});

describe("clientesPorSemana", () => {
  it("põe cada cliente na semana dele, pelo dia de São Paulo", () => {
    const s = clientesPorSemana(resumos, "2026-10-07", 4);
    expect(s.map((x) => x.fim)).toEqual(["2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07"]);
    expect(s.map((x) => x.total)).toEqual([0, 1, 0, 4]);
    expect(s[3].porCanal).toEqual({ instagram: 2, google: 1, portal: 1 });
  });
});
