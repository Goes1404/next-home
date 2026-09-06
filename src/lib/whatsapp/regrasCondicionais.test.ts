import { describe, expect, it } from "vitest";
import { regrasCondicionais } from "./regrasCondicionais";

describe("regrasCondicionais", () => {
  it("com um balão só, não injeta nada", () => {
    // É o caso comum. A regra da rajada ocupava 698 caracteres em TODO
    // turno para valer numa fração deles.
    expect(regrasCondicionais({ baloesDaVez: 1 })).toBeUndefined();
    expect(regrasCondicionais({ baloesDaVez: 0 })).toBeUndefined();
  });

  it("com dois ou mais, manda responder TODOS", () => {
    const bloco = regrasCondicionais({ baloesDaVez: 3 });
    expect(bloco).toBeDefined();
    expect(bloco).toContain("Responda o conteúdo de TODAS");
    // A regra do tamanho não pode ser afrouxada pela da rajada: responder
    // três coisas não autoriza um parágrafo com tópicos.
    expect(bloco).toMatch(/mensagens curtas/);
  });
});
