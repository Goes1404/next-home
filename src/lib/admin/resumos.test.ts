import { describe, expect, it } from "vitest";
import { contarPorEtapa, montarResumo, paradosHa, taxaConversao } from "./resumos";
import type { Lead } from "@/lib/types";

function lead(parcial: Partial<Lead> & { id: string }): Lead {
  return {
    nome: "Lead",
    email: null,
    telefone: null,
    mensagem: null,
    tipo: "comprador",
    detalhes: null,
    origem: null,
    criadoEm: new Date().toISOString(),
    etapa: "novo",
    etapaAlteradaEm: new Date().toISOString(),
    origemAtribuicao: null,
    corretor: null,
    empreendimento: null,
    visitaAgendadaEm: null,
    ...parcial,
  } as Lead;
}

const EQUIPE = [
  { id: "c1", nome: "Ana", emPausa: false },
  { id: "c2", nome: "Bruno", emPausa: true },
  { id: "c3", nome: "Carla", emPausa: false },
];

describe("Carga por corretor", () => {
  const leads = [
    lead({ id: "1", corretor: { id: "c1", nome: "Ana" }, etapa: "novo" }),
    lead({ id: "2", corretor: { id: "c1", nome: "Ana" }, etapa: "fechado" }),
    lead({ id: "3", corretor: { id: "c2", nome: "Bruno" }, origemAtribuicao: "roleta" }),
    lead({ id: "4", corretor: null }),
  ];

  it("quem não recebeu nada aparece zerado — é o corretor que a roleta esqueceu", () => {
    const resumo = montarResumo(leads, EQUIPE);
    const carla = resumo.find((r) => r.id === "c3");
    expect(carla).toBeDefined();
    expect(carla!.total).toBe(0);
  });

  it("ordena por carga e conta novos, fechados e os que vieram da roleta", () => {
    const resumo = montarResumo(leads, EQUIPE);
    expect(resumo[0].id).toBe("c1");
    expect(resumo[0]).toMatchObject({ total: 2, novos: 1, fechados: 1, porRoleta: 0 });
    expect(resumo.find((r) => r.id === "c2")).toMatchObject({ porRoleta: 1, emPausa: true });
  });

  it("lead sem dono não entra na carga de ninguém", () => {
    const resumo = montarResumo(leads, EQUIPE);
    expect(resumo.reduce((s, r) => s + r.total, 0)).toBe(3);
  });
});

describe("Taxa de conversão", () => {
  it("divide pelos CONCLUÍDOS, não pelo total", () => {
    // 1 fechado, 1 perdido, 8 ainda em jogo → 50%, não 10%. Dividir pelo
    // total faria a taxa cair justamente quando a captação vai bem.
    const leads = [
      lead({ id: "1", etapa: "fechado" }),
      lead({ id: "2", etapa: "perdido" }),
      ...Array.from({ length: 8 }, (_, i) => lead({ id: `n${i}`, etapa: "novo" })),
    ];
    expect(taxaConversao(leads)).toBe(50);
  });

  it("sem ninguém concluído devolve null em vez de fingir 0%", () => {
    expect(taxaConversao([lead({ id: "1", etapa: "novo" })])).toBeNull();
  });
});

describe("Leads parados", () => {
  const agora = new Date("2026-08-22T12:00:00Z");
  const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();

  it("pega os mexidos há N dias ou mais", () => {
    const leads = [
      lead({ id: "1", etapa: "novo", etapaAlteradaEm: diasAtras(20) }),
      lead({ id: "2", etapa: "novo", etapaAlteradaEm: diasAtras(3) }),
    ];
    expect(paradosHa(leads, 15, agora).map((l) => l.id)).toEqual(["1"]);
  });

  it("fechado e perdido não estão parados — estão prontos", () => {
    const leads = [
      lead({ id: "1", etapa: "fechado", etapaAlteradaEm: diasAtras(90) }),
      lead({ id: "2", etapa: "perdido", etapaAlteradaEm: diasAtras(90) }),
    ];
    expect(paradosHa(leads, 15, agora)).toHaveLength(0);
  });
});

describe("Contagem por etapa", () => {
  it("agrupa sem inventar etapa que não existe na base", () => {
    const contagem = contarPorEtapa([
      lead({ id: "1", etapa: "novo" }),
      lead({ id: "2", etapa: "novo" }),
      lead({ id: "3", etapa: "negociacao" }),
    ]);
    expect(contagem).toEqual({ novo: 2, negociacao: 1 });
  });
});
