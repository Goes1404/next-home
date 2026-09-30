import { describe, expect, it } from "vitest";
import {
  compararCampanhas,
  gastoAte,
  serieDeCusto,
  lerValorEmReais,
  resumirImpulsionamentos,
  totaisDosImpulsionamentos,
  type LinhaImpulsionamento,
} from "./impulsionamentosCalculo";
import { TITULO_SEM_ETIQUETA } from "@/lib/whatsapp/anuncioMeta";

const base = { url: null, empreendimentoId: null, primeiroLeadEm: "2026-09-01", ultimoLeadEm: "2026-09-02" };
const A: LinhaImpulsionamento = { ...base, id: "1", corretorId: "c1", chave: "111", titulo: "Post A", valorGasto: 100 };
const B: LinhaImpulsionamento = { ...base, id: "2", corretorId: "c1", chave: "sem-etiqueta", titulo: null, valorGasto: null };
const lead = (o: Partial<{ corretorId: string; metaAdId: string | null; anuncioOrigem: string | null; etapa: string; visitaAgendadaEm: string | null; temperatura: "quente" | "morno" | "frio" | null }>) => ({
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

describe("campanhas cadastradas pelo corretor (0132)", () => {
  const campanha: LinhaImpulsionamento = {
    ...base, id: "c", corretorId: "c1", chave: "manual:x", titulo: "Google out", valorGasto: 200,
    criadaPeloCorretor: true, canal: "google",
  };
  const anuncio: LinhaImpulsionamento = { ...base, id: "a", corretorId: "c1", chave: "222", titulo: "Post", valorGasto: 100, agrupadoEm: "c" };
  const solto: LinhaImpulsionamento = { ...base, id: "s", corretorId: "c1", chave: "333", titulo: "Solto", valorGasto: 60 };
  const leads = [
    lead({ metaAdId: "222", temperatura: "quente", etapa: "visita_agendada" }),
    lead({ metaAdId: "222", temperatura: "frio" }),
    { ...lead({ temperatura: "morno" }), impulsionamentoId: "c" },
    { ...lead({}), impulsionamentoId: "c" },
    lead({ metaAdId: "333", temperatura: "frio" }),
    lead({ metaAdId: "333", temperatura: "frio" }),
    lead({ metaAdId: "333", temperatura: "quente", etapa: "fechado" }),
  ];
  const resumos = resumirImpulsionamentos([campanha, anuncio, solto], leads);

  it("o anúncio agrupado some da lista de cima e conta na campanha", () => {
    expect(resumos.map((r) => r.id)).toEqual(["c", "s"]);
    const [rc] = resumos;
    expect(rc.anuncios.map((a) => a.id)).toEqual(["a"]);
    expect(rc).toMatchObject({ leads: 4, visitas: 1, gastoTotal: 300, custoPorLead: 75, custoPorVisita: 300 });
  });

  it("campanha manual não pega lead pelo id da Meta, só pelo vínculo", () => {
    const [rc] = resumirImpulsionamentos([campanha], leads);
    expect(rc.leads).toBe(2);
  });

  it("qualidade conta a temperatura e o custo por cliente bom", () => {
    const [rc, rs] = resumos;
    expect(rc.qualidade).toEqual({ quente: 1, morno: 1, frio: 1, semLeitura: 1 });
    expect(rc.taxaDeBonsLeads).toBe(67);
    expect(rc.custoPorBomLead).toBe(150);
    expect(rs.taxaDeBonsLeads).toBe(33);
  });

  it("anúncio agrupado numa campanha que sumiu volta para cima", () => {
    expect(resumirImpulsionamentos([anuncio], leads).map((r) => r.id)).toEqual(["a"]);
  });

  it("a comparação marca a de menor custo por visita, não a mais barata por cliente", () => {
    const linhas = compararCampanhas(resumos, (r) => r.titulo ?? "");
    expect(linhas.map((l) => l.id)).toEqual(["s", "c"]); // 20 por cliente antes de 75
    expect(linhas.find((l) => l.melhor)?.id).toBe("s"); // 60 por visita contra 300
    const semVisita = compararCampanhas(
      resumirImpulsionamentos([{ ...solto, valorGasto: 10 }, campanha, anuncio], leads.map((l) => ({ ...l, etapa: "novo" }))),
      (r) => r.id,
    );
    expect(semVisita.find((l) => l.melhor)?.id).toBe(semVisita[0].id);
  });

  it("uma campanha só não vira comparação com vencedor", () => {
    expect(compararCampanhas([resumos[1]], (r) => r.id).some((l) => l.melhor)).toBe(false);
  });
});

describe("custo ao longo do tempo (0133)", () => {
  const camp: LinhaImpulsionamento = {
    ...base, id: "k", corretorId: "c1", chave: "manual:k", titulo: "K", valorGasto: 300,
    criadaPeloCorretor: true, inicio: "2026-09-01",
  };
  const HOJE = "2026-09-30";

  it("sem registro com data, espalha o total do início até hoje", () => {
    expect(gastoAte(camp, [], "2026-08-31", HOJE)).toBe(0);
    expect(gastoAte(camp, [], "2026-09-01", HOJE)).toBe(0);
    expect(gastoAte(camp, [], "2026-09-30", HOJE)).toBe(300);
    expect(gastoAte(camp, [], "2026-09-15", HOJE)).toBeCloseTo(144.83, 1);
  });

  it("entre dois registros o gasto anda por igual, e depois do último fica parado", () => {
    const pts = [
      { impulsionamentoId: "k", dia: "2026-09-11", valor: 100 },
      { impulsionamentoId: "k", dia: "2026-09-21", valor: 300 },
    ];
    expect(gastoAte(camp, pts, "2026-09-06", HOJE)).toBe(50);
    expect(gastoAte(camp, pts, "2026-09-16", HOJE)).toBe(200);
    expect(gastoAte(camp, pts, "2026-09-29", HOJE)).toBe(300);
  });

  it("registro feito depois do fim conta como gasto até o fim", () => {
    const acabou = { ...camp, fim: "2026-09-11" };
    const pts = [{ impulsionamentoId: "k", dia: "2026-09-25", valor: 100 }];
    expect(gastoAte(acabou, pts, "2026-09-11", HOJE)).toBe(100);
  });

  it("a série usa as últimas 4 semanas e só começa com 3 clientes", () => {
    const leads = [
      { ...lead({}), impulsionamentoId: "k", criadoEm: "2026-09-05T15:00:00Z" },
      { ...lead({}), impulsionamentoId: "k", criadoEm: "2026-09-20T15:00:00Z" },
      { ...lead({}), impulsionamentoId: "k", criadoEm: "2026-09-29T15:00:00Z" },
    ];
    const resumos = resumirImpulsionamentos([camp], leads);
    const serie = serieDeCusto(resumos, [{ impulsionamentoId: "k", dia: "2026-09-30", valor: 300 }], HOJE);
    expect(serie.map((p) => p.dia)).toEqual(["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"]);
    expect(serie.map((p) => p.novos)).toEqual([0, 1, 0, 1, 1]);
    // Antes do 3º cliente não há custo, mesmo com gasto.
    expect(serie.slice(0, 4).every((p) => p.custoMovel === null)).toBe(true);
    // Janela de 2/9 a 30/9: gasto de 300 menos o do dia 2 (~10,34), 3 clientes.
    expect(serie.at(-1)).toMatchObject({ clientes4: 3, informado: true });
    expect(serie.at(-1)?.custoMovel).toBeCloseTo(96.55, 1);
    expect(serie[3].informado).toBe(false);
  });

  it("a janela móvel mostra a piora que o acumulado esconderia", () => {
    const longa = { ...camp, inicio: "2026-06-01" };
    const cedo = Array.from({ length: 10 }, (_, i) => ({ ...lead({}), impulsionamentoId: "k", criadoEm: `2026-06-${String(i + 5).padStart(2, "0")}T12:00:00Z` }));
    const tarde = [{ ...lead({}), impulsionamentoId: "k", criadoEm: "2026-09-25T12:00:00Z" }];
    const serie = serieDeCusto(resumirImpulsionamentos([longa], [...cedo, ...tarde]), [], HOJE, 20);
    const ultimo = serie.at(-1)!;
    // Acumulado seria 300/11 ≈ 27; nas últimas 4 semanas foi ~70 para 1 cliente.
    expect(ultimo.clientes4).toBe(1);
    expect(ultimo.custoMovel!).toBeGreaterThan(60);
  });

  it("sem gasto informado não há série", () => {
    expect(serieDeCusto(resumirImpulsionamentos([{ ...camp, valorGasto: null }], []), [], HOJE)).toEqual([]);
  });
});
