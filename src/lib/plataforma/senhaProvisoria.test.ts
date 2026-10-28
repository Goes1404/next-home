import { describe, expect, it } from "vitest";
import { gerarSenhaProvisoria, TAMANHO_DA_SENHA_PROVISORIA } from "./senhaProvisoria";

describe("senha temporária gerada pela plataforma", () => {
  it("tem 12 caracteres, minúscula, maiúscula e dígito, sem os que se confundem", () => {
    for (let i = 0; i < 200; i++) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toHaveLength(TAMANHO_DA_SENHA_PROVISORIA);
      expect(senha).toMatch(/[a-z]/);
      expect(senha).toMatch(/[A-Z]/);
      expect(senha).toMatch(/[2-9]/);
      expect(senha).not.toMatch(/[01OlI]/);
    }
  });

  it("não repete: duas seguidas saem diferentes", () => {
    const vistas = new Set(Array.from({ length: 50 }, () => gerarSenhaProvisoria()));
    expect(vistas.size).toBe(50);
  });

  it("descarta o byte que daria viés em vez de usar o resto da divisão", () => {
    // 255 cai fora do teto de qualquer alfabeto que não divide 256; o próximo byte vale.
    let n = 0;
    const bytes = [255, 0];
    const sortear = (b: Uint8Array) => {
      b[0] = bytes[n++ % bytes.length];
      return b;
    };
    expect(gerarSenhaProvisoria(sortear)).toHaveLength(TAMANHO_DA_SENHA_PROVISORIA);
  });
});
