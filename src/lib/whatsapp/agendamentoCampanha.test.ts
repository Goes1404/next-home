import { describe, expect, it } from "vitest";
import { montarFilaCampanha } from "./campaignQueue";

describe("agendamento da campanha", () => {
  it("começa no instante futuro escolhido, sem antecipar a primeira mensagem", () => {
    const inicio = "2030-09-10T15:00:00.000Z";
    const fila = montarFilaCampanha({
      campanhaId: "agendada",
      leads: [{ id: "lead-1", nome: "Ana", telefone: "5511999999999" }],
      mensagemBase: "Olá, {nome}",
      iniciarEm: inicio,
    });

    expect(fila[0]?.agendadoPara).toBe(inicio);
  });

  it("mantém o espaçamento depois do início agendado", () => {
    const fila = montarFilaCampanha({
      campanhaId: "agendada",
      leads: [
        { id: "lead-1", nome: "Ana", telefone: "5511999999999" },
        { id: "lead-2", nome: "Bia", telefone: "5511988888888" },
      ],
      mensagemBase: "Olá, {nome}",
      iniciarEm: "2030-09-10T15:00:00.000Z",
      intervaloSegundosMinimo: 35,
    });

    const intervalo =
      new Date(fila[1]!.agendadoPara).getTime() -
      new Date(fila[0]!.agendadoPara).getTime();
    expect(intervalo).toBeGreaterThanOrEqual(35_000);
  });
});
