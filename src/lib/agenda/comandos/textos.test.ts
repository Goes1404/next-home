import { describe, expect, it } from "vitest";
import {
  formatarDia,
  formatarQuando,
  textoDaAgendaDoDia,
  textoDeConfirmacao,
  textoDeEscolha,
  textoNaoEntendi,
} from "./textos";

// Em 2026: 31/10 é sábado, 01/11 domingo, 03/11 terça, 06/11 sexta.

describe("formatarQuando", () => {
  it("dia da semana curto, dia/mês e hora cheia", () => {
    expect(formatarQuando("2026-10-31T10:00:00-03:00")).toBe("sáb 31/10 às 10h");
  });

  it("minutos só quando não são zero", () => {
    expect(formatarQuando("2026-11-01T09:30:00-03:00")).toBe("dom 01/11 às 9h30");
    expect(formatarQuando("2026-11-01T09:05:00-03:00")).toBe("dom 01/11 às 9h05");
  });

  it("fuso de São Paulo: 23h30 do dia 31 continua no dia 31, mesmo já sendo dia 1 em UTC", () => {
    expect(formatarQuando("2026-10-31T23:30:00-03:00")).toBe("sáb 31/10 às 23h30");
    expect(formatarQuando("2026-11-01T02:30:00Z")).toBe("sáb 31/10 às 23h30");
  });

  it("meia-noite é 0h", () => {
    expect(formatarQuando("2026-11-01T00:00:00-03:00")).toBe("dom 01/11 às 0h");
  });

  it("texto que não é instante: devolve vazio, sem lançar", () => {
    expect(formatarQuando("amanhã")).toBe("");
  });
});

describe("formatarDia", () => {
  it("dia-calendário vira dia da semana curto e dia/mês", () => {
    expect(formatarDia("2026-10-31")).toBe("sáb 31/10");
    expect(formatarDia("2026-11-06")).toBe("sex 06/11");
    expect(formatarDia("2026-10-27")).toBe("ter 27/10");
  });
});

describe("textoDeConfirmacao", () => {
  it("visita com nome do lead e do imóvel", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "marcar_visita", cliente: "Ana", quando: "2026-11-01T10:00:00-03:00", imovel: "Alpha" },
        { nomeDoLead: "Ana Souza", nomeDoImovel: "Res. Alpha" },
      ),
    ).toBe("Entendi: visita com Ana Souza, dom 01/11 às 10h, Res. Alpha. Confirma? (sim/não)");
  });

  it("visita sem imóvel e sem lead achado usa o nome que o corretor disse", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "marcar_visita", cliente: "Ana", quando: "2026-11-01T10:30:00-03:00", imovel: null },
        {},
      ),
    ).toBe("Entendi: visita com Ana, dom 01/11 às 10h30. Confirma? (sim/não)");
  });

  it("bloqueio no mesmo dia, com motivo", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "bloquear", inicio: "2026-10-30T14:00:00-03:00", fim: "2026-10-30T16:00:00-03:00", motivo: "médico" },
        {},
      ),
    ).toBe("Entendi: horário bloqueado sex 30/10 das 14h às 16h (médico). Confirma? (sim/não)");
  });

  it("bloqueio sem motivo", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "bloquear", inicio: "2026-10-30T14:00:00-03:00", fim: "2026-10-30T15:30:00-03:00", motivo: null },
        {},
      ),
    ).toBe("Entendi: horário bloqueado sex 30/10 das 14h às 15h30. Confirma? (sim/não)");
  });

  it("bloqueio que atravessa a noite mostra os dois dias", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "bloquear", inicio: "2026-10-30T14:00:00-03:00", fim: "2026-10-31T12:00:00-03:00", motivo: "viagem" },
        {},
      ),
    ).toBe("Entendi: horário bloqueado de sex 30/10 às 14h até sáb 31/10 às 12h (viagem). Confirma? (sim/não)");
  });

  it("lembrete com cliente", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "lembrete", cliente: "João", texto: "ligar pro João", quando: "2026-10-29T09:00:00-03:00" },
        { nomeDoLead: "João Pereira" },
      ),
    ).toBe("Entendi: lembrete qui 29/10 às 9h: ligar pro João (João Pereira). Confirma? (sim/não)");
  });

  it("lembrete sem cliente", () => {
    expect(
      textoDeConfirmacao(
        { tipo: "lembrete", cliente: null, texto: "pagar o condomínio", quando: "2026-10-29T09:00:00-03:00" },
        {},
      ),
    ).toBe("Entendi: lembrete qui 29/10 às 9h: pagar o condomínio. Confirma? (sim/não)");
  });

  it("reunião com a equipe toda, sem assunto", () => {
    expect(
      textoDeConfirmacao(
        {
          tipo: "reuniao",
          titulo: "Reunião",
          inicio: "2026-11-02T09:00:00-03:00",
          fim: "2026-11-02T10:00:00-03:00",
          participantes: "equipe",
        },
        {},
      ),
    ).toBe("Entendi: reunião com a equipe toda, seg 02/11 das 9h às 10h. Confirma? (sim/não)");
  });

  it("reunião com nomes e assunto", () => {
    expect(
      textoDeConfirmacao(
        {
          tipo: "reuniao",
          titulo: "metas",
          inicio: "2026-11-06T15:00:00-03:00",
          fim: "2026-11-06T16:00:00-03:00",
          participantes: ["Bruno", "Carla"],
        },
        { nomesDosParticipantes: ["Bruno Alves", "Carla Dias"] },
      ),
    ).toBe("Entendi: reunião sobre metas com Bruno Alves e Carla Dias, sex 06/11 das 15h às 16h. Confirma? (sim/não)");
  });

  it("reunião com três nomes, sem nomes achados usa os que o gestor disse", () => {
    expect(
      textoDeConfirmacao(
        {
          tipo: "reuniao",
          titulo: "Reunião",
          inicio: "2026-11-06T15:00:00-03:00",
          fim: "2026-11-06T16:00:00-03:00",
          participantes: ["Bruno", "Carla", "Davi"],
        },
        {},
      ),
    ).toBe("Entendi: reunião com Bruno, Carla e Davi, sex 06/11 das 15h às 16h. Confirma? (sim/não)");
  });
});

describe("textoNaoEntendi", () => {
  it("corretor: diz que não entendeu e dá exemplos, sem reunião", () => {
    const t = textoNaoEntendi(false);
    expect(t).toMatch(/não entendi/i);
    expect(t).toContain("visita com a Ana sábado 10h");
    expect(t).toContain("me lembra de ligar pro João quinta 9h");
    expect(t).not.toMatch(/reunião/i);
  });

  it("gestor: também o exemplo de reunião", () => {
    expect(textoNaoEntendi(true)).toContain("reunião com a equipe toda segunda 9h");
  });
});

describe("textoDeEscolha", () => {
  it("lista numerada numa linha", () => {
    expect(textoDeEscolha("Ana", [{ nome: "Ana Souza" }, { nome: "Ana Lima" }])).toBe(
      'Achei mais de um cliente com "Ana": 1) Ana Souza 2) Ana Lima. Responda com o número.',
    );
  });
});

describe("textoDaAgendaDoDia", () => {
  it("itens em ordem de horário, hora sempre com minutos", () => {
    expect(
      textoDaAgendaDoDia("2026-10-31", [
        { inicio: "2026-10-31T14:30:00-03:00", descricao: "Bloqueado · médico" },
        { inicio: "2026-10-31T10:00:00-03:00", descricao: "Visita · Ana Souza" },
        { inicio: "2026-10-31T09:05:00-03:00", descricao: "Lembrete · ligar pro João" },
      ]),
    ).toBe(
      "Sua agenda de sáb 31/10:\n9h05 · Lembrete · ligar pro João\n10h00 · Visita · Ana Souza\n14h30 · Bloqueado · médico",
    );
  });

  it("hora no fuso de São Paulo mesmo com instante em UTC", () => {
    expect(textoDaAgendaDoDia("2026-10-31", [{ inicio: "2026-11-01T02:30:00Z", descricao: "Visita · Ana" }])).toBe(
      "Sua agenda de sáb 31/10:\n23h30 · Visita · Ana",
    );
  });

  it("dia vazio", () => {
    expect(textoDaAgendaDoDia("2026-11-01", [])).toBe("Nada marcado em dom 01/11.");
  });
});

describe("sem jargão", () => {
  it("nenhum texto fala de cota, fila ou instância", () => {
    const textos = [
      textoNaoEntendi(true),
      textoNaoEntendi(false),
      textoDeEscolha("Ana", [{ nome: "Ana Souza" }]),
      textoDaAgendaDoDia("2026-11-01", []),
    ];
    for (const t of textos) expect(t).not.toMatch(/cota|fila|instância|instancia/i);
  });
});
