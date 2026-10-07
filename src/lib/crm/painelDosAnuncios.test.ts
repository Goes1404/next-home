import { describe, expect, it } from "vitest";
import { resumirImpulsionamentos, type LinhaImpulsionamento } from "./impulsionamentosCalculo";
import { canaisDoPeriodo, indicadoresEntre, janelaDo, montarDadosDoPainel, semanasDa, variacao } from "./painelDosAnuncios";

const base = { url: null, empreendimentoId: null, primeiroLeadEm: "2026-09-01", ultimoLeadEm: "2026-10-06", corretorId: "c1", criadaPeloCorretor: true };
const camp = (id: string, canal: LinhaImpulsionamento["canal"], valorGasto: number | null, inicio: string): LinhaImpulsionamento => ({
  ...base, id, chave: `manual:${id}`, titulo: id, valorGasto, canal, inicio,
});
const lead = (imp: string, dia: string, etapa = "novo") => ({
  id: `${imp}-${dia}-${etapa}`, corretorId: "c1", metaAdId: null, anuncioOrigem: null, etapa, visitaAgendadaEm: null,
  impulsionamentoId: imp, criadoEm: `${dia}T15:00:00Z`,
});
const leads = [
  lead("ig", "2026-10-05"), lead("ig", "2026-10-01", "visitou"), lead("ig", "2026-09-01"),
  lead("gg", "2026-10-02"), lead("zap", "2026-10-03"),
];
const linhas = [camp("ig", "instagram", 900, "2026-08-08"), camp("gg", "google", 300, "2026-09-07"), camp("zap", "portal", null, "2026-09-01")];
const resumos = resumirImpulsionamentos(linhas, leads);
// Gasto do Instagram: 900 até hoje, registrado só no fim (distribuído pelos 59 dias desde 08/08).
const dados = montarDadosDoPainel(resumos, leads, [], "2026-10-06");

describe("painel dos anúncios", () => {
  it("janela de 30 dias com a anterior do mesmo tamanho", () => {
    const j = janelaDo(dados, 30);
    expect(j).toMatchObject({ de: "2026-09-07", ate: "2026-10-06", anterior: { de: "2026-08-08", ate: "2026-09-06" } });
  });

  it("gasto do período é a fatia distribuída pelos dias, e o custo só conta quem tem gasto", () => {
    const j = janelaDo(dados, 30);
    const ind = indicadoresEntre(dados, j.de, j.ate, null);
    expect(ind.clientes).toBe(4);
    expect(ind.clientesSemGasto).toBe(1);
    expect(ind.gasto).toBeCloseTo(900 * (30 / 59) + 300, 0);
    expect(ind.custoPorCliente).toBeCloseTo(ind.gasto / 3, 1);
    expect(ind.visitas).toBe(1);
  });

  it("filtrar por canal recorta tudo", () => {
    const j = janelaDo(dados, 30);
    const ind = indicadoresEntre(dados, j.de, j.ate, "google");
    expect(ind).toMatchObject({ clientes: 1, gasto: 300, custoPorCliente: 300 });
  });

  it("canais e semanas", () => {
    const j = janelaDo(dados, 30);
    expect(canaisDoPeriodo(dados, j).map((c) => c.canal)).toEqual(["instagram", "google", "portal"]);
    const s = semanasDa(dados, j, null);
    expect(s.at(-1)?.fim).toBe("2026-10-06");
    expect(s.reduce((t, x) => t + x.clientes, 0)).toBe(4);
  });

  it("variação sem base é nula", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(15, 10)).toBe(50);
  });
});
