import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatarTelefoneBr } from "./phoneUtils";

describe("formatarTelefoneBr — o telefone como se escreve", () => {
  it("celular em qualquer formato vira (DD) 9XXXX-XXXX", () => {
    for (const bruto of ["+55 11 98191-8127", "5511981918127", "11981918127", "11.98191-8127", "(11)98191 8127"]) {
      expect(formatarTelefoneBr(bruto), bruto).toBe("(11) 98191-8127");
    }
  });

  it("fixo de oito dígitos vira (DD) XXXX-XXXX", () => {
    expect(formatarTelefoneBr("1141911234")).toBe("(11) 4191-1234");
  });

  it("sem DDD assume 11, e a tela mostra isso", () => {
    expect(formatarTelefoneBr("98191-8127")).toBe("(11) 98191-8127");
  });

  it("número estrangeiro ou quebrado volta como chegou", () => {
    expect(formatarTelefoneBr("+1 415 555 2671")).toBe("+1 415 555 2671");
    expect(formatarTelefoneBr("123")).toBe("123");
    expect(formatarTelefoneBr("")).toBe("");
  });

  it("a importação formata na revisão e de novo ao gravar", () => {
    const acoes = readFileSync("src/app/corretor/(painel)/importar/actions.ts", "utf8");
    expect(acoes.match(/formatarTelefoneBr\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("a revisão deixa tirar uma coluna, e a coluna tirada não vai para o banco", () => {
    const tela = readFileSync("src/app/corretor/(painel)/importar/ImportarClient.tsx", "utf8");
    expect(tela).toContain('mensagem: colunasFora.has("mensagem") ? null : l.mensagem');
    expect(tela).toContain('email: colunasFora.has("email") ? null : l.email');
  });
});
