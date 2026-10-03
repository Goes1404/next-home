import { describe, expect, it } from "vitest";
import { montarListasSugeridas, type LeadParaSugestao } from "./listasSugeridas";

const agora = new Date("2026-10-03T12:00:00Z");
const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();

function lead(p: Partial<LeadParaSugestao> & { id: string }): LeadParaSugestao {
  return {
    nome: p.id,
    telefone: "5511999990000",
    etapa: "primeiro_contato",
    tentativasContato: 1,
    ultimoContatoEm: diasAtras(40),
    imovel: null,
    naoContatar: false,
    arquivado: false,
    reativadoSemResposta: false,
    ...p,
  };
}

describe("listas sugeridas", () => {
  it("novos sem primeiro contato: ninguém falou com eles ainda", () => {
    const r = montarListasSugeridas(
      [lead({ id: "a", etapa: "novo", tentativasContato: 0, ultimoContatoEm: null }), lead({ id: "b" })],
      { diasParado: 30, agora },
    );
    expect(r.novos.map((l) => l.id)).toEqual(["a"]);
  });

  it("parados há X dias respeita a escolha do corretor", () => {
    const leads = [lead({ id: "20d", ultimoContatoEm: diasAtras(20) }), lead({ id: "40d" })];
    expect(montarListasSugeridas(leads, { diasParado: 15, agora }).parados.map((l) => l.id)).toEqual(["20d", "40d"]);
    expect(montarListasSugeridas(leads, { diasParado: 30, agora }).parados.map((l) => l.id)).toEqual(["40d"]);
  });

  it("deixa de fora não contatar, arquivado, fechado, perdido e quem não respondeu à última lista", () => {
    const r = montarListasSugeridas(
      [
        lead({ id: "ok" }),
        lead({ id: "nao", naoContatar: true }),
        lead({ id: "arq", arquivado: true }),
        lead({ id: "fech", etapa: "fechado" }),
        lead({ id: "perd", etapa: "perdido" }),
        lead({ id: "insistir", reativadoSemResposta: true }),
      ],
      { diasParado: 30, agora },
    );
    expect(r.parados.map((l) => l.id)).toEqual(["ok"]);
  });

  it("etapa mais avançada primeiro, depois o interesse mais recente", () => {
    const r = montarListasSugeridas(
      [
        lead({ id: "contato-antigo", ultimoContatoEm: diasAtras(90) }),
        lead({ id: "contato-recente", ultimoContatoEm: diasAtras(35) }),
        lead({ id: "visita", etapa: "visita_agendada", ultimoContatoEm: diasAtras(90) }),
      ],
      { diasParado: 30, agora },
    );
    expect(r.parados.map((l) => l.id)).toEqual(["visita", "contato-recente", "contato-antigo"]);
  });

  it("agrupa os parados por imóvel, o maior grupo primeiro", () => {
    const vitra = { slug: "vitra", nome: "Vitra" };
    const breeze = { slug: "breeze", nome: "Breeze" };
    const r = montarListasSugeridas(
      [lead({ id: "1", imovel: vitra }), lead({ id: "2", imovel: breeze }), lead({ id: "3", imovel: breeze })],
      { diasParado: 30, agora },
    );
    expect(r.porImovel.map((g) => [g.imovel.slug, g.leads.length])).toEqual([
      ["breeze", 2],
      ["vitra", 1],
    ]);
  });
});
