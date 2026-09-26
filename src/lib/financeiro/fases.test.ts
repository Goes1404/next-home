import { describe, expect, it } from "vitest";
import { diasEntre, diasRestantesNoMes, intervaloDo, lerPeriodo, mesAtual } from "./periodo";
import { aReceberDasConstrutoras, extratoDo, repasseDoPeriodo, repassesAPagar, type VendaDoExtrato } from "./extrato";
import { calcularRitmo, escolherComissaoPorVenda, escolherTaxa, fraseDoRitmo } from "./ritmo";
import { preverCaixa, VENDAS_MINIMAS_PARA_ESTIMAR } from "./previsao";
import {
  desempenhoPorCorretor,
  especialistasPorImovel,
  formatarMinutos,
  oQueOsMelhoresFazem,
  tempoDeRespostaPorCorretor,
  type LeadDoDesempenho,
} from "./desempenho";
import { agregarPorCampanha } from "@/lib/admin/funilDeAnuncios";

describe("períodos no calendário de São Paulo", () => {
  it("mês, trimestre e ano", () => {
    expect(intervaloDo("mes", "2026-02-10")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(intervaloDo("trimestre", "2026-09-26")).toEqual({ inicio: "2026-07-01", fim: "2026-09-30" });
    expect(intervaloDo("ano", "2026-09-26")).toEqual({ inicio: "2026-01-01", fim: "2026-12-31" });
  });
  it("parâmetro desconhecido cai no mês", () => {
    expect(lerPeriodo("qualquer")).toBe("mes");
    expect(lerPeriodo(["ano"])).toBe("ano");
  });
  it("dias restantes contam hoje", () => {
    expect(diasRestantesNoMes("2026-09-30")).toBe(1);
    expect(diasRestantesNoMes("2026-09-01")).toBe(30);
    expect(mesAtual("2026-09-26")).toBe("2026-09-01");
    expect(diasEntre("2026-09-01", "2026-09-26")).toBe(25);
  });
});

const venda = (m: Partial<VendaDoExtrato> = {}): VendaDoExtrato => ({
  id: "v1",
  imovel: "Eternity",
  construtora: "Cyrela",
  unidade: "A 42",
  dataVenda: "2026-09-01",
  valorVenda: 600000,
  comissaoValor: 30000,
  status: "ativa",
  comissaoRecebidaEm: null,
  participantes: [
    { corretorId: "c1", nome: "Bruna", partePercentual: 50, repasseValor: 6000, repassePagoEm: null },
    { corretorId: "c2", nome: "Edu", partePercentual: 50, repasseValor: 6000, repassePagoEm: null },
  ],
  ...m,
});

describe("extrato", () => {
  it("separa o que a construtora já pagou do que ainda depende dela", () => {
    const e = extratoDo("c1", [venda(), venda({ id: "v2", comissaoRecebidaEm: "2026-09-20" })], "2026-09-26");
    expect(e.aReceber).toBe(12000);
    expect(e.liberado).toBe(6000);
    expect(e.linhas.map((l) => l.situacao).sort()).toEqual(["aguardando_construtora", "pode_pagar"]);
  });
  it("repasse pago entra no recebido do ano, por mês", () => {
    const pago = venda({
      participantes: [{ corretorId: "c1", nome: "B", partePercentual: 100, repasseValor: 5000, repassePagoEm: "2026-08-10" }],
    });
    const e = extratoDo("c1", [pago], "2026-09-26");
    expect(e.aReceber).toBe(0);
    expect(e.recebidoNoAno).toBe(5000);
    expect(e.recebidoPorMes).toEqual([{ mes: "2026-08", valor: 5000 }]);
  });
  it("distrato não fica a receber", () => {
    expect(extratoDo("c1", [venda({ status: "distratada" })], "2026-09-26").aReceber).toBe(0);
  });
  it("repasse do período conta só venda ativa no intervalo", () => {
    expect(repasseDoPeriodo("c1", [venda(), venda({ id: "x", dataVenda: "2026-08-31" })], "2026-09-01", "2026-09-30")).toBe(6000);
  });
  it("gestor: dívida das construtoras ordenada pela mais velha", () => {
    const g = aReceberDasConstrutoras(
      [venda(), venda({ id: "v2", construtora: "EZTEC", dataVenda: "2026-06-01" }), venda({ id: "v3", comissaoRecebidaEm: "2026-09-02" })],
      "2026-09-26",
    );
    expect(g.map((x) => x.construtora)).toEqual(["EZTEC", "Cyrela"]);
    expect(g[0].maisAntigaDias).toBe(117);
    expect(g[1].total).toBe(30000);
  });
  it("gestor: repasse liberado não se mistura com o que depende da construtora", () => {
    const r = repassesAPagar([venda(), venda({ id: "v2", comissaoRecebidaEm: "2026-09-20" })]);
    const bruna = r.find((x) => x.corretorId === "c1")!;
    expect(bruna.liberado).toBe(6000);
    expect(bruna.aguardando).toBe(6000);
  });
});

describe("meta traduzida em trabalho", () => {
  it("taxa própria só com amostra mínima; senão a da equipe; senão nenhuma", () => {
    expect(escolherTaxa({ sucessos: 1, tentativas: 1 }, null, 5)).toBeNull();
    expect(escolherTaxa({ sucessos: 1, tentativas: 1 }, { sucessos: 4, tentativas: 20 }, 5)).toEqual({
      valor: 0.2,
      fonte: "equipe",
      amostra: 20,
    });
    expect(escolherTaxa({ sucessos: 3, tentativas: 10 }, { sucessos: 4, tentativas: 20 }, 5)?.fonte).toBe("suas");
  });
  it("comissão por venda: duas vendas dele valem mais que o palpite", () => {
    expect(escolherComissaoPorVenda({ mediaPropria: 8000, vendasProprias: 2, estimativa: 5000, mediaEquipe: 7000 })?.fonte).toBe("suas_vendas");
    expect(escolherComissaoPorVenda({ mediaPropria: 8000, vendasProprias: 1, estimativa: 5000, mediaEquipe: 7000 })?.fonte).toBe("sua_estimativa");
    expect(escolherComissaoPorVenda({ mediaPropria: null, vendasProprias: 0, estimativa: null, mediaEquipe: null })).toBeNull();
  });
  it("R$ 15 mil de meta, R$ 3 mil ganhos, R$ 6 mil por venda: 2 vendas, 10 visitas, 50 atendimentos", () => {
    const r = calcularRitmo({
      meta: 15000,
      ganhoNoMes: 3000,
      comissaoPorVenda: { valor: 6000, fonte: "suas_vendas" },
      visitaParaVenda: { valor: 0.2, fonte: "suas", amostra: 10 },
      leadParaVisita: { valor: 0.2, fonte: "equipe", amostra: 50 },
      diasRestantes: 14,
    });
    expect([r.vendas, r.visitas, r.atendimentos, r.atendimentosPorSemana]).toEqual([2, 10, 50, 25]);
    expect(fraseDoRitmo(r)).toBe("Faltam 2 vendas, que pedem 10 visitas, que pedem 50 atendimentos.");
  });
  it("sem taxa a conta para no degrau que dá para afirmar", () => {
    const r = calcularRitmo({
      meta: 10000,
      ganhoNoMes: 0,
      comissaoPorVenda: { valor: 5000, fonte: "sua_estimativa" },
      visitaParaVenda: null,
      leadParaVisita: null,
      diasRestantes: 20,
    });
    expect([r.vendas, r.visitas, r.atendimentos]).toEqual([2, null, null]);
    expect(fraseDoRitmo(r)).toBe("Faltam 2 vendas.");
  });
  it("meta batida", () => {
    const r = calcularRitmo({ meta: 1000, ganhoNoMes: 1500, comissaoPorVenda: null, visitaParaVenda: null, leadParaVisita: null, diasRestantes: 3 });
    expect(r.atingida).toBe(true);
    expect(r.progresso).toBe(1);
  });
});

describe("previsão de caixa", () => {
  it("sem amostra, só o certo, e o motivo por escrito", () => {
    const p = preverCaixa({ certo: 9000, leadsEmDocumentacao: 3, docParaVenda: 0.5, rendePorVenda: 6000, vendasNaHistoria: 2 });
    expect(p.estimado).toBeNull();
    expect(p.semEstimativa).toMatch(String(VENDAS_MINIMAS_PARA_ESTIMAR));
  });
  it("com amostra, estima", () => {
    const p = preverCaixa({ certo: 0, leadsEmDocumentacao: 4, docParaVenda: 0.5, rendePorVenda: 6000, vendasNaHistoria: 8 });
    expect(p.estimado).toBe(12000);
  });
});

describe("desempenho por corretor e por imóvel", () => {
  const leads: LeadDoDesempenho[] = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, corretorId: "c1", imovelId: "e1", criadoEm: "2026-09-01", visitou: i < 2 })),
    { id: "l9", corretorId: "c2", imovelId: "e2", criadoEm: "2026-09-01", visitou: false },
  ];
  const vendas = [
    {
      id: "v1",
      leadId: "l0",
      empreendimentoId: "e1",
      imovel: "Eternity",
      dataVenda: "2026-09-11",
      valorVenda: 500000,
      status: "ativa" as const,
      participantes: [{ corretorId: "c1", partePercentual: 100 }],
    },
  ];
  const d = desempenhoPorCorretor({ leads, vendas, nomeDoImovel: new Map([["e1", "Eternity"], ["e2", "Vitra"]]) });

  it("conversão, VGV e tempo até a venda", () => {
    const c1 = d.get("c1")!;
    expect([c1.atendidos, c1.visitas, c1.vendas, c1.vgv]).toEqual([4, 2, 1, 500000]);
    expect(c1.leadParaVisita).toBe(0.5);
    expect(c1.visitaParaVenda).toBe(0.5);
    expect(c1.diasAteVenda).toBe(10);
  });
  it("especialidade exige fato (venda ou 3 atendimentos)", () => {
    expect(d.get("c1")!.especialidade?.imovel).toBe("Eternity");
    expect(d.get("c2")!.especialidade).toBeNull();
    expect(especialistasPorImovel(d).get("e1")?.corretorId).toBe("c1");
  });
});

describe("o que os melhores fazem", () => {
  const conversa = (c: string, minutos: number) => ({
    corretorId: c,
    primeiraFalaCliente: "2026-09-01T12:00:00Z",
    primeiraRespostaCorretor: new Date(Date.parse("2026-09-01T12:00:00Z") + minutos * 60000).toISOString(),
    primeiraRespostaIa: null,
  });
  it("mediana da primeira resposta, e quem ficou sem resposta", () => {
    const t = tempoDeRespostaPorCorretor([
      conversa("c1", 2),
      conversa("c1", 4),
      { corretorId: "c1", primeiraFalaCliente: "2026-09-01T12:00:00Z", primeiraRespostaCorretor: null, primeiraRespostaIa: null },
    ]);
    expect(t.get("c1")).toMatchObject({ conversas: 3, medianaMin: 3, semResposta: 1 });
  });
  it("sem amostra, nenhuma frase", () => {
    const d = desempenhoPorCorretor({
      leads: [{ id: "a", corretorId: "c1", imovelId: null, criadoEm: "2026-09-01", visitou: true }],
      vendas: [],
      nomeDoImovel: new Map(),
    });
    expect(oQueOsMelhoresFazem({ desempenho: d, tempos: new Map(), nomes: new Map() })).toBeNull();
  });
  it("com amostra, nomeia a diferença", () => {
    const leads: LeadDoDesempenho[] = [];
    for (let i = 0; i < 10; i++) leads.push({ id: `a${i}`, corretorId: "c1", imovelId: null, criadoEm: "2026-09-01", visitou: i < 5 });
    for (let i = 0; i < 10; i++) leads.push({ id: `b${i}`, corretorId: "c2", imovelId: null, criadoEm: "2026-09-01", visitou: i < 1 });
    const d = desempenhoPorCorretor({ leads, vendas: [], nomeDoImovel: new Map() });
    const tempos = tempoDeRespostaPorCorretor([
      ...Array.from({ length: 5 }, () => conversa("c1", 3)),
      ...Array.from({ length: 5 }, () => conversa("c2", 120)),
    ]);
    const frase = oQueOsMelhoresFazem({ desempenho: d, tempos, nomes: new Map([["c1", "Bruna"]]) });
    expect(frase).toMatch(/^Bruna leva 3 min/);
    expect(frase).toMatch(/2 h/);
  });
  it("formata minutos", () => {
    expect(formatarMinutos(0.5)).toBe("menos de 1 minuto");
    expect(formatarMinutos(90)).toBe("1,5 h");
    expect(formatarMinutos(60 * 50)).toBe("2 dias");
  });
});

describe("anúncio → comissão", () => {
  it("cada real de anúncio: quanto voltou em comissão", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [{ campanhaId: "k1", nome: "Eternity", gasto: 2000 }],
      leads: [{ id: "l1", metaCampanhaId: "k1", visitaAgendadaEm: null, etapa: "fechado" }],
      dossies: [],
      vendas: [{ leadId: "l1", vgv: 600000, comissao: 30000 }],
    });
    expect(campanhas[0]).toMatchObject({ vgv: 600000, comissao: 30000, retorno: 15 });
  });
  it("sem gasto, retorno não é infinito", () => {
    const { campanhas } = agregarPorCampanha({
      gastos: [],
      leads: [{ id: "l1", metaCampanhaId: "k1", visitaAgendadaEm: null, etapa: "fechado" }],
      dossies: [],
    });
    expect(campanhas[0].retorno).toBeNull();
  });
});
