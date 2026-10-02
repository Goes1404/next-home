import { describe, expect, it } from "vitest";
import {
  compararCampanhas,
  compararQualidade,
  contarDegraus,
  degrauDoCliente,
  gastoAte,
  serieDeCusto,
  lerValorEmReais,
  resumirImpulsionamentos,
  campanhaDoAnuncioDetectado,
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

  it("totais contam e dividem a mesma população: só quem informou gasto", () => {
    expect(totaisDosImpulsionamentos([ra, rb])).toMatchObject({
      anuncios: 2,
      semGasto: 1,
      clientesSemGasto: 1,
      gasto: 100,
      clientes: 3,
      visitas: 2,
      custoPorLead: 33.33,
      custoPorVisita: 50,
      custoPorFechado: null,
    });
  });

  it("sem nenhum gasto informado, nenhum custo é inventado", () => {
    expect(totaisDosImpulsionamentos([rb])).toMatchObject({ gasto: 0, clientes: 0, clientesSemGasto: 1, custoPorLead: null });
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

  it("qualificado é quem esquentou ou visitou; o custo divide pelo qualificado", () => {
    const [rc, rs] = resumos;
    // quente+visita, morno, frio, sem leitura
    expect(rc.degraus).toMatchObject({ chegaram: 4, qualificados: 2, visitaram: 1, fecharam: 0 });
    expect(rc.custoPorQualificado).toBe(150);
    expect(rc.taxaDeQualificados).toBeNull(); // 4 clientes: pouco para porcentagem
    expect(rs.degraus).toMatchObject({ chegaram: 3, qualificados: 1, fecharam: 1 });
  });

  it("anúncio agrupado numa campanha que sumiu volta para cima", () => {
    expect(resumirImpulsionamentos([anuncio], leads).map((r) => r.id)).toEqual(["a"]);
  });

  it("com poucos clientes nenhuma campanha disputa o melhor", () => {
    const c = compararCampanhas(resumos, (r) => r.titulo ?? "");
    expect(c.criterio).toBeNull();
    expect(c.melhor).toBeNull();
    expect(c.linhas.every((l) => l.pequena)).toBe(true);
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

describe("qualidade pelo que o cliente fez", () => {
  const l = (o: Record<string, unknown>) => ({ ...lead({}), ...o });

  it("uma fala só é a mensagem pronta do botão; duas já é conversa", () => {
    expect(degrauDoCliente(l({ falasDoCliente: 1 }))).toBe(0);
    expect(degrauDoCliente(l({ falasDoCliente: 2 }))).toBe(1);
  });

  it("renda dita qualifica mesmo com a IA lendo frio", () => {
    expect(degrauDoCliente(l({ temperatura: "frio", capacidadeDita: true }))).toBe(2);
    expect(degrauDoCliente(l({ temperatura: "frio", falasDoCliente: 5 }))).toBe(1);
  });

  it("os degraus contêm os de baixo, e quem saiu corre por fora", () => {
    const d = contarDegraus([
      l({ etapa: "fechado" }),
      l({ visitaAgendadaEm: "2026-09-10", etapa: "perdido" }),
      l({ falasDoCliente: 3, pediuParaSair: true }),
      l({}),
    ]);
    expect(d).toEqual({ chegaram: 4, conversaram: 3, qualificados: 2, visitaram: 2, fecharam: 1, sairam: 2 });
  });

  it("a comparação põe amostra pequena no fim, mesmo com taxa maior", () => {
    const linha = (id: string): LinhaImpulsionamento => ({
      ...base, id, corretorId: "c1", chave: `k${id}`, titulo: id, valorGasto: null,
    });
    const leads = [
      ...Array.from({ length: 10 }, (_, i) => l({ metaAdId: "kgrande", capacidadeDita: i < 3 })),
      ...Array.from({ length: 2 }, () => l({ metaAdId: "kpequena", capacidadeDita: true })),
      ...Array.from({ length: 6 }, (_, i) => l({ metaAdId: "kmedia", capacidadeDita: i < 3 })),
    ];
    const r = resumirImpulsionamentos([linha("grande"), linha("pequena"), linha("media")], leads);
    expect(compararQualidade(r, (x) => x.id).map((x) => x.id)).toEqual(["media", "grande", "pequena"]);
  });
});

describe("comparação entre campanhas", () => {
  const camp = (id: string, gasto: number | null): LinhaImpulsionamento => ({
    ...base, id, corretorId: "c1", chave: `manual:${id}`, titulo: id, valorGasto: gasto, criadaPeloCorretor: true,
  });
  const muitos = (id: string, n: number, visitas: number, qualif: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...lead({ visitaAgendadaEm: i < visitas ? "2026-09-10" : null }),
      impulsionamentoId: id,
      capacidadeDita: i < qualif,
    }));

  it("ordem e melhor seguem o mesmo critério: custo por visita", () => {
    // barata: 10 clientes por 100 (10 cada), 1 visita → 100 por visita
    // cara: 5 clientes por 150 (30 cada), 3 visitas → 50 por visita
    const r = resumirImpulsionamentos(
      [camp("barata", 100), camp("cara", 150)],
      [...muitos("barata", 10, 1, 2), ...muitos("cara", 5, 3, 3)],
    );
    const c = compararCampanhas(r, (x) => x.id);
    expect(c.criterio).toBe("visita");
    expect(c.linhas.map((l) => l.id)).toEqual(["cara", "barata"]);
    expect(c.melhor).toBe("cara");
    expect(c.segunda).toBe("barata");
  });

  it("sem visita em duas, desce para o custo por qualificado", () => {
    const r = resumirImpulsionamentos(
      [camp("a", 100), camp("b", 100)],
      [...muitos("a", 5, 0, 1), ...muitos("b", 5, 0, 4)],
    );
    const c = compararCampanhas(r, (x) => x.id);
    expect(c.criterio).toBe("qualificado");
    expect(c.melhor).toBe("b");
  });

  it("quem gastou e não trouxe ninguém aparece no fim; sem gasto não entra", () => {
    const r = resumirImpulsionamentos(
      [camp("a", 100), camp("b", 100), camp("zero", 300), camp("semGasto", null), camp("pequena", 50)],
      [...muitos("a", 5, 1, 1), ...muitos("b", 6, 2, 2), ...muitos("pequena", 2, 2, 2), ...muitos("semGasto", 9, 0, 0)],
    );
    const c = compararCampanhas(r, (x) => x.id);
    expect(c.linhas.map((l) => l.id)).toEqual(["b", "a", "pequena", "zero"]);
    expect(c.melhor).toBe("b"); // a pequena tem visita mais barata, mas não disputa
  });
});

describe("lead do link do anúncio cai na campanha do imóvel (02/10/2026)", () => {
  const dom: LinhaImpulsionamento = {
    ...base, id: "dom", corretorId: "c1", chave: "manual:dom", titulo: "Dom", valorGasto: 200,
    empreendimentoId: "e-dom", criadaPeloCorretor: true, inicio: "2026-09-29",
  };
  const nomes = { "e-dom": ["Dom Parque", "Lançamento ao Lado do Parque"] };
  const doLink = (o: { anuncioOrigem: string; criadoEm: string; corretorId?: string }) => ({
    ...lead({ anuncioOrigem: o.anuncioOrigem, corretorId: o.corretorId ?? "c1" }),
    criadoEm: o.criadoEm,
  });

  it("conta o lead do link com o nome ou o apelido do imóvel", () => {
    const leads = [
      doLink({ anuncioOrigem: "dom parque", criadoEm: "2026-09-30T00:01:43Z" }),
      doLink({ anuncioOrigem: "lancamento ao lado do parque", criadoEm: "2026-10-01T16:00:00Z" }),
    ];
    expect(resumirImpulsionamentos([dom], leads, nomes)[0].leads).toBe(2);
  });

  it("não conta lead de antes do início, de outro imóvel ou de outro corretor", () => {
    const leads = [
      doLink({ anuncioOrigem: "dom parque", criadoEm: "2026-09-28T12:00:00Z" }),
      doLink({ anuncioOrigem: "eternity alphaville", criadoEm: "2026-09-30T12:00:00Z" }),
      doLink({ anuncioOrigem: "dom parque", criadoEm: "2026-09-30T12:00:00Z", corretorId: "c2" }),
    ];
    expect(resumirImpulsionamentos([dom], leads, nomes)[0].leads).toBe(0);
  });

  it("dia é o de São Paulo: 22h de 28/09 em Brasília ainda é antes do início", () => {
    const leads = [doLink({ anuncioOrigem: "dom parque", criadoEm: "2026-09-29T01:00:00Z" })];
    expect(resumirImpulsionamentos([dom], leads, nomes)[0].leads).toBe(0);
  });

  it("lead ligado à mão a outra campanha não é contado duas vezes", () => {
    const outra: LinhaImpulsionamento = { ...dom, id: "outra", chave: "manual:outra", empreendimentoId: null };
    const ligado = { ...doLink({ anuncioOrigem: "dom parque", criadoEm: "2026-09-30T12:00:00Z" }), impulsionamentoId: "outra" };
    const [rd, ro] = resumirImpulsionamentos([dom, outra], [ligado], nomes);
    expect(rd.leads).toBe(0);
    expect(ro.leads).toBe(1);
  });

  it("com duas campanhas do imóvel no ar, vale a que começou por último", () => {
    const nova: LinhaImpulsionamento = { ...dom, id: "nova", chave: "manual:nova", inicio: "2026-10-01" };
    const leads = [doLink({ anuncioOrigem: "dom parque", criadoEm: "2026-10-02T12:00:00Z" })];
    const [rd, rn] = resumirImpulsionamentos([dom, nova], leads, nomes);
    expect([rd.leads, rn.leads]).toEqual([0, 1]);
  });
});

describe("anúncio detectado pela etiqueta cai sozinho na campanha (02/10/2026)", () => {
  const dom: LinhaImpulsionamento = {
    ...base, id: "dom", corretorId: "c1", chave: "manual:dom", titulo: "Dom", valorGasto: 200,
    empreendimentoId: "e-dom", criadaPeloCorretor: true, canal: "instagram", inicio: "2026-09-29",
  };
  const nomes = { "e-dom": ["Dom Parque"], "e-eter": ["Eternity Alphaville"] };
  const anuncio = (o: Partial<LinhaImpulsionamento> = {}): LinhaImpulsionamento => ({
    ...base, id: "ad1", corretorId: "c1", chave: "123", titulo: "Seu apê perto do parque", valorGasto: 50,
    primeiroLeadEm: "2026-10-01T15:00:00Z", ...o,
  });
  const daEtiqueta = () => ({ ...lead({ metaAdId: "123", corretorId: "c1" }), criadoEm: "2026-10-01T15:00:00Z" });

  it("o cliente e o gasto do anúncio contam na campanha, sem linha própria", () => {
    const r = resumirImpulsionamentos([dom, anuncio()], [daEtiqueta()], nomes);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("dom");
    expect(r[0].leads).toBe(1);
    expect(r[0].gastoTotal).toBe(250);
    expect(r[0].anuncios[0].agrupadoSozinho).toBe(true);
  });

  it("não cai em campanha de outro canal, fora do período ou de outro corretor", () => {
    for (const c of [
      { ...dom, canal: "google" as const },
      { ...dom, inicio: "2026-10-05" },
      { ...dom, fim: "2026-09-30" },
      { ...dom, corretorId: "c2" },
    ]) {
      expect(campanhaDoAnuncioDetectado(anuncio(), [c, anuncio()], nomes)).toBeNull();
    }
  });

  it("título que cita outro imóvel não cai na campanha do Dom", () => {
    expect(campanhaDoAnuncioDetectado(anuncio({ titulo: "Eternity Alphaville 2 dorms" }), [dom], nomes)).toBeNull();
  });

  it("com duas no ar, vence a do imóvel citado no título", () => {
    const eter = { ...dom, id: "eter", chave: "manual:eter", empreendimentoId: "e-eter", inicio: "2026-09-30" };
    expect(campanhaDoAnuncioDetectado(anuncio({ titulo: "Dom Parque lançamento" }), [dom, eter], nomes)).toBe("dom");
  });

  it("agrupado à mão continua onde está", () => {
    const outra = { ...dom, id: "outra", chave: "manual:outra", canal: "facebook" as const };
    const r = resumirImpulsionamentos([dom, outra, anuncio({ agrupadoEm: "outra" })], [daEtiqueta()], nomes);
    expect(r.find((x) => x.id === "outra")?.leads).toBe(1);
    expect(r.find((x) => x.id === "dom")?.leads).toBe(0);
  });
});
