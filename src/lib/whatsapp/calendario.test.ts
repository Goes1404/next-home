import { describe, expect, it } from "vitest";

import { calendarioProximosDias } from "./aiAgent";

/*
 * O calendário do prompt pareia um rótulo em português ("sábado, 29/08")
 * com a data ISO que a IA deve devolver. Se os dois saírem de fusos
 * diferentes, o prompt ensina uma equivalência FALSA — e o modelo agenda no
 * dia errado obedecendo ao que leu.
 */
describe("calendarioProximosDias", () => {
  it("não adianta a data quando o servidor em UTC já virou o dia", () => {
    // 00:30 UTC de 24/08 = 21:30 de domingo, 23/08, em Brasília.
    const primeira = calendarioProximosDias(3, new Date("2026-08-24T00:30:00Z")).split("\n")[0];
    expect(primeira).toContain("domingo");
    expect(primeira).toContain("2026-08-23");
  });

  it("mantém rótulo e ISO coerentes em qualquer hora do dia", () => {
    for (const hora of ["12:00", "21:00", "23:30", "02:00"]) {
      const linhas = calendarioProximosDias(7, new Date(`2026-08-24T${hora}:00Z`)).split("\n");
      for (const linha of linhas) {
        const [rotulo, iso] = linha.split(" = ");
        const diaDoRotulo = rotulo.match(/(\d{2})\/(\d{2})/)!;
        expect(`${iso.slice(8, 10)}/${iso.slice(5, 7)}`).toBe(`${diaDoRotulo[1]}/${diaDoRotulo[2]}`);
      }
    }
  });
});
