import { describe, expect, it } from "vitest";
import { estaMarcando, pedidoDeAgendamento } from "./pedidoDeAgendamento";

/**
 * As falas deste arquivo são as REAIS da conversa 2cff42f6 (10/09/2026), em
 * que o cliente levou cinco turnos para marcar o que tinha dito na primeira
 * frase. Testar com frases inventadas esconderia justamente o caso que
 * quebrou.
 */
describe("pedidoDeAgendamento", () => {
  it("reconhece o pedido de visita da primeira frase", () => {
    const p = pedidoDeAgendamento("Quero marcar uma visita no amanhã");
    expect(p.pediuVisita).toBe(true);
    expect(p.dia).toBe("amanhã");
  });

  it("aceite do convite é pedido de visita", () => {
    // A IA pergunta "quer conhecer o decorado?"; quem responde isso está
    // pedindo visita, não fazendo conversa.
    expect(pedidoDeAgendamento("sim, quero conhecer").pediuVisita).toBe(true);
    expect(pedidoDeAgendamento("quero ver ao vivo").pediuVisita).toBe(true);
  });

  it("a contraproposta escolhe o dia NOVO, nunca o recusado", () => {
    // "Sábado eu não consigo, pode ser segunda?" — marcar sábado aqui seria
    // marcar exatamente o dia que ele acabou de descartar.
    const p = pedidoDeAgendamento("Sábado eu não consigo, pode ser segunda?");
    expect(p.dia).toBe("segunda-feira");
  });

  it("dia solto conta — foi o que virava 'me diz o que te ajudaria'", () => {
    expect(pedidoDeAgendamento("Segunda feira").dia).toBe("segunda-feira");
    expect(pedidoDeAgendamento("pode ser na terça").dia).toBe("terça-feira");
  });

  it("hora solta conta", () => {
    expect(pedidoDeAgendamento("9h").hora).toBe(9);
    expect(pedidoDeAgendamento("às 15").hora).toBe(15);
    expect(pedidoDeAgendamento("pode ser 10 horas").hora).toBe(10);
  });

  it("dia e hora na mesma fala", () => {
    const p = pedidoDeAgendamento("consigo segunda às 9h");
    expect(p.dia).toBe("segunda-feira");
    expect(p.hora).toBe(9);
  });

  it("número que não é hora não vira compromisso", () => {
    // "2 reais" foi a resposta dele à pergunta de faixa de valor, no meio da
    // mesma conversa. Sem o teto de 23 e a exigência de 'h'/'às', todo número
    // da conversa viraria horário marcado.
    expect(pedidoDeAgendamento("2 reais").hora).toBeNull();
    expect(pedidoDeAgendamento("uns 600 mil").hora).toBeNull();
    expect(pedidoDeAgendamento("1").hora).toBeNull();
  });

  it("conversa que não é agendamento não vira agendamento", () => {
    for (const texto of ["quero na planta", "quantos quartos tem?", "essa tá massa", "oi"]) {
      expect(estaMarcando(pedidoDeAgendamento(texto)), texto).toBe(false);
    }
  });

  it("estaMarcando basta um sinal", () => {
    expect(estaMarcando(pedidoDeAgendamento("Segunda feira"))).toBe(true);
    expect(estaMarcando(pedidoDeAgendamento("9h"))).toBe(true);
    expect(estaMarcando(pedidoDeAgendamento("quero marcar uma visita"))).toBe(true);
  });
});
