import { describe, expect, it } from "vitest";
import type { ItemDaAgenda } from "./itens";
import { proximosDeHoje } from "./hoje";

const AGORA = new Date("2026-10-27T15:00:00Z"); // 12h em SP

const lembrete = (id: string, inicio: string): ItemDaAgenda => ({ tipo: "lembrete", id, inicio, texto: id, leadId: null });

describe("proximosDeHoje", () => {
  it("o que já passou há mais de uma hora sai; o de meia hora atrás fica", () => {
    const itens = [lembrete("passou", "2026-10-27T13:30:00Z"), lembrete("recente", "2026-10-27T14:30:00Z")];
    expect(proximosDeHoje(itens, AGORA).map((i) => i.id)).toEqual(["recente"]);
  });

  it("corta em três, na ordem recebida", () => {
    const itens = ["a", "b", "c", "d"].map((id, n) => lembrete(id, `2026-10-27T1${6 + n}:00:00Z`));
    expect(proximosDeHoje(itens, AGORA).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("aceita outro teto", () => {
    const itens = ["a", "b"].map((id, n) => lembrete(id, `2026-10-27T1${6 + n}:00:00Z`));
    expect(proximosDeHoje(itens, AGORA, 1).map((i) => i.id)).toEqual(["a"]);
  });
});
