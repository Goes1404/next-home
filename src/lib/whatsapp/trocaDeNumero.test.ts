import { describe, expect, it } from "vitest";
import { mesmoNumero, resetPorTrocaDeNumero } from "./trocaDeNumero";

describe("Reconhecer que é o mesmo número", () => {
  it("ignora formatação", () => {
    expect(mesmoNumero("5511950085875", "+55 11 95008-5875")).toBe(true);
  });

  it("números diferentes não se confundem", () => {
    expect(mesmoNumero("5511950085875", "5511999998888")).toBe(false);
  });

  it("vazio nunca é 'o mesmo'", () => {
    expect(mesmoNumero(null, "5511950085875")).toBe(false);
    expect(mesmoNumero("5511950085875", "")).toBe(false);
  });
});

describe("Reset de reputação na troca de número", () => {
  const agora = new Date(2026, 7, 22, 18, 0);

  it("número novo zera contador, bloqueio e curva de aquecimento", () => {
    // Chip novo herdar a maturidade do anterior é o caminho mais curto para
    // o banimento: dispararia em volume alto num número que a Meta acabou
    // de ver pela primeira vez.
    const r = resetPorTrocaDeNumero("5511950085875", "5511999998888", agora);
    expect(r).toEqual({
      envios_campanha_contador: 0,
      envios_campanha_data: null,
      bloqueado_ate: null,
      falhas_seguidas: 0,
      conectado_em: agora.toISOString(),
    });
  });

  it("RECONECTAR o mesmo número não zera nada", () => {
    // Zerar aqui puniria quem só caiu da internet: perderia a maturidade e
    // voltaria para a cota de primeiro dia.
    expect(resetPorTrocaDeNumero("5511950085875", "+5511950085875", agora)).toBeNull();
  });

  it("primeira conexão da instância não é troca", () => {
    expect(resetPorTrocaDeNumero(null, "5511950085875", agora)).toBeNull();
  });

  it("provedor que não informa o número não zera nada", () => {
    // "Não sei qual é" não pode virar "é outro" — zeraria a maturidade de
    // um número que não mudou.
    expect(resetPorTrocaDeNumero("5511950085875", null, agora)).toBeNull();
    expect(resetPorTrocaDeNumero("5511950085875", "", agora)).toBeNull();
  });
});
