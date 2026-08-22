import { describe, expect, it } from "vitest";
import { agendaDoDia, agruparPorDia, situacaoDaTarefa, type Interacao, type Tarefa } from "./timeline";

function tarefa(p: Partial<Tarefa> & { id: string; prazo: string }): Tarefa {
  return { titulo: "Retornar", concluidaEm: null, ...p };
}

describe("Situação da tarefa", () => {
  // 22/08 às 15h — depois do horário de várias tarefas do próprio dia.
  const agora = new Date(2026, 7, 22, 15, 0);

  it("tarefa das 9h de hoje continua sendo DE HOJE às 15h, não atrasada", () => {
    // Comparar por hora pintaria a tela de vermelho toda tarde e ensinaria
    // o corretor a ignorar o alerta.
    expect(situacaoDaTarefa(tarefa({ id: "1", prazo: new Date(2026, 7, 22, 9, 0).toISOString() }), agora)).toBe("hoje");
  });

  it("ontem é atrasada", () => {
    expect(situacaoDaTarefa(tarefa({ id: "1", prazo: new Date(2026, 7, 21, 23, 0).toISOString() }), agora)).toBe("atrasada");
  });

  it("amanhã é futura", () => {
    expect(situacaoDaTarefa(tarefa({ id: "1", prazo: new Date(2026, 7, 23, 8, 0).toISOString() }), agora)).toBe("futura");
  });

  it("concluída não é atrasada, mesmo com prazo vencido", () => {
    const t = tarefa({
      id: "1",
      prazo: new Date(2026, 7, 1).toISOString(),
      concluidaEm: new Date(2026, 7, 2).toISOString(),
    });
    expect(situacaoDaTarefa(t, agora)).toBe("concluida");
  });
});

describe("Agenda do dia", () => {
  const agora = new Date(2026, 7, 22, 15, 0);

  it("mostra atrasadas e de hoje, na ordem do prazo, e esconde o futuro", () => {
    const lista = [
      tarefa({ id: "futura", prazo: new Date(2026, 7, 25, 9, 0).toISOString() }),
      tarefa({ id: "hoje", prazo: new Date(2026, 7, 22, 17, 0).toISOString() }),
      tarefa({ id: "atrasada", prazo: new Date(2026, 7, 20, 9, 0).toISOString() }),
      tarefa({ id: "feita", prazo: new Date(2026, 7, 19).toISOString(), concluidaEm: new Date().toISOString() }),
    ];
    expect(agendaDoDia(lista, agora).map((t) => t.id)).toEqual(["atrasada", "hoje"]);
  });
});

describe("Linha do tempo agrupada por dia", () => {
  function ev(id: string, em: string): Interacao {
    return { id, tipo: "nota", conteudo: id, autor: null, em };
  }

  it("mescla fontes fora de ordem e agrupa por dia, do mais novo ao mais antigo", () => {
    // O caso real: interações do CRM e mensagens do WhatsApp vêm de duas
    // consultas e nunca chegam ordenadas entre si.
    const grupos = agruparPorDia([
      ev("crm-18", "2026-08-18T10:00:00Z"),
      ev("zap-22a", "2026-08-22T08:00:00Z"),
      ev("crm-22", "2026-08-22T14:00:00Z"),
      ev("zap-18", "2026-08-18T16:00:00Z"),
    ]);

    expect(grupos.map((g) => g.dia)).toEqual(["2026-08-22", "2026-08-18"]);
    expect(grupos[0].itens.map((i) => i.id)).toEqual(["crm-22", "zap-22a"]);
    expect(grupos[1].itens.map((i) => i.id)).toEqual(["zap-18", "crm-18"]);
  });

  it("lista vazia não vira grupo fantasma", () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});
