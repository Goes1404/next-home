import { describe, expect, it } from "vitest";
import {
  canalDaOrigem,
  PADROES_DO_CANAL,
  chegouAVisita,
  esperadoAteHoje,
  faixasDeEspera,
  maiorVazamento,
  origemDosLeads,
  passagemDoFunil,
  placarDaEquipe,
  procuraPorImovel,
} from "./calculos";

describe("passagemDoFunil", () => {
  const passos = passagemDoFunil({
    novo: 10,
    primeiro_contato: 20,
    visita_agendada: 6,
    documentacao: 2,
    fechado: 2,
    perdido: 30,
  });

  it("conta quem chegou à etapa ou passou dela, sem os perdidos", () => {
    expect(passos.map((p) => p.alcancaram)).toEqual([40, 30, 10, 4, 2]);
  });

  it("dá a passagem do passo anterior", () => {
    expect(passos.map((p) => p.doAnterior)).toEqual([null, 75, 33, 40, 50]);
  });

  it("aponta o passo que mais vaza", () => {
    expect(maiorVazamento(passos)).toBe("visita_agendada");
  });

  it("carteira vazia não inventa porcentagem", () => {
    const vazio = passagemDoFunil({});
    expect(vazio.every((p) => p.doAnterior === null)).toBe(true);
    expect(maiorVazamento(vazio)).toBeNull();
  });
});

describe("faixasDeEspera", () => {
  const agora = new Date("2026-09-28T12:00:00Z");
  const ha = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

  it("separa por tempo de espera", () => {
    expect(faixasDeEspera([ha(0.5), ha(2), ha(5.9), ha(10), ha(30), ha(72)], agora)).toEqual({
      ate_1h: 1,
      ate_6h: 2,
      ate_24h: 1,
      mais_de_24h: 2,
    });
  });
});

describe("canalDaOrigem", () => {
  it.each([
    ["meta/ctwa", "anuncio"],
    ["meta/leadads", "anuncio"],
    ["inbound/zap", "portal"],
    ["site/contato", "site"],
    ["site/me-avise", "site"],
    ["whatsapp/organico", "whatsapp"],
    ["painel/importacao", "importacao"],
    ["painel/manual", "manual"],
    ["indicacao", "indicacao"],
    ["parceiro", "indicacao"],
    [null, "outros"],
  ])("%s → %s", (o, c) => expect(canalDaOrigem(o)).toBe(c));
});

describe("origemDosLeads", () => {
  it("conta leads e visitas por canal e divide o gasto", () => {
    const linhas = origemDosLeads(
      [
        { origem: "meta/ctwa", etapa: "novo", visitaAgendadaEm: null },
        { origem: "meta/ctwa", etapa: "visita_agendada", visitaAgendadaEm: null },
        { origem: "meta/ctwa", etapa: "perdido", visitaAgendadaEm: "2026-09-01T10:00:00Z" },
        { origem: "meta/ctwa", etapa: "novo", visitaAgendadaEm: null },
        { origem: "site/contato", etapa: "fechado", visitaAgendadaEm: null },
      ],
      { anuncio: 200 },
    );
    expect(linhas[0]).toEqual({
      canal: "anuncio",
      leads: 4,
      visitas: 2,
      fechados: 0,
      gasto: 200,
      custoPorLead: 50,
      custoPorVisita: 100,
    });
    expect(linhas[1]).toMatchObject({ canal: "site", leads: 1, visitas: 1, fechados: 1, custoPorLead: null });
  });

  it("canal que gastou e não trouxe ninguém aparece", () => {
    expect(origemDosLeads([], { anuncio: 80 })).toEqual([
      { canal: "anuncio", leads: 0, visitas: 0, fechados: 0, gasto: 80, custoPorLead: null, custoPorVisita: null },
    ]);
  });
});

describe("placarDaEquipe", () => {
  it("soma por corretor e ordena por vendas", () => {
    const linhas = placarDaEquipe(
      [
        { id: "a", nome: "Ana" },
        { id: "b", nome: "Bia" },
      ],
      [
        { corretorId: "a", etapa: "novo", visitaAgendadaEm: null },
        { corretorId: "a", etapa: "novo", visitaAgendadaEm: null },
        { corretorId: "b", etapa: "visita_agendada", visitaAgendadaEm: null },
        { corretorId: "b", etapa: "fechado", visitaAgendadaEm: null },
        { corretorId: null, etapa: "novo", visitaAgendadaEm: null },
      ],
      [{ corretorId: "b" }],
    );
    expect(linhas.map((l) => [l.nome, l.leads, l.visitas, l.vendas, l.conversao])).toEqual([
      ["Bia", 2, 2, 1, 50],
      ["Ana", 2, 0, 0, null],
    ]);
  });
});

describe("procuraPorImovel", () => {
  it("usa o imóvel de interesse antes do cadastro e conta vendas", () => {
    const linhas = procuraPorImovel(
      [
        { id: "x", nome: "Manacá", slug: "manaca" },
        { id: "y", nome: "Terra Alta", slug: "terra-alta" },
      ],
      [
        { empreendimentoId: "y", imovelInteresseId: "x", etapa: "novo", visitaAgendadaEm: null },
        { empreendimentoId: "y", imovelInteresseId: null, etapa: "fechado", visitaAgendadaEm: null },
        { empreendimentoId: null, imovelInteresseId: "x", etapa: "novo", visitaAgendadaEm: null },
      ],
      [{ empreendimentoId: "y" }, { empreendimentoId: null }],
    );
    expect(linhas.map((l) => [l.nome, l.leads, l.visitas, l.vendas])).toEqual([
      ["Manacá", 2, 0, 0],
      ["Terra Alta", 1, 1, 1],
    ]);
  });
});

describe("chegouAVisita", () => {
  it("vale o fato ou a etapa", () => {
    expect(chegouAVisita({ etapa: "perdido", visitaAgendadaEm: "2026-09-01" })).toBe(true);
    expect(chegouAVisita({ etapa: "documentacao", visitaAgendadaEm: null })).toBe(true);
    expect(chegouAVisita({ etapa: "primeiro_contato", visitaAgendadaEm: null })).toBe(false);
  });
});

describe("esperadoAteHoje", () => {
  it("é a fração do mês que já passou", () => {
    expect(esperadoAteHoje(30000, 30, 20)).toBe(10000);
    expect(esperadoAteHoje(30000, 30, 30)).toBe(0);
    expect(esperadoAteHoje(0, 30, 10)).toBe(0);
  });
});

describe("o gráfico e a lista contam as mesmas pessoas", () => {
  // `ilike` do Postgres, em miniatura: % = qualquer coisa, sem caixa.
  const casa = (padrao: string, valor: string) =>
    new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/%/g, ".*")}$`, "i").test(valor);

  it.each([
    "meta/ctwa",
    "meta/leadads",
    "inbound/zap",
    "inbound/vivareal",
    "site/contato",
    "site/me-avise",
    "whatsapp/organico",
    "painel/importacao",
    "painel/manual",
    "painel",
    "indicacao",
    "parceiro",
    "webhook",
    "painel/outra-coisa",
  ])("%s cai no mesmo canal no gráfico e no filtro", (origem) => {
    const canal = canalDaOrigem(origem);
    const doFiltro = (Object.entries(PADROES_DO_CANAL) as [string, string[] | null][])
      .filter(([, padroes]) => padroes?.some((p) => casa(p, origem)))
      .map(([c]) => c);
    expect(doFiltro).toEqual(canal === "outros" ? [] : [canal]);
  });
});
