import { describe, expect, it } from "vitest";
import { lerProposta, propostaVencida, ultimaResposta, validarProposta } from "./proposta";

const agora = new Date("2026-09-26T12:00:00Z");
const boa = { imovel: "Vitra", unidade: "101", valor: 480000, condicao: "10% de entrada e financiamento", validadeDias: 7 };

describe("proposta por link", () => {
  it("aceita a proposta completa e calcula a validade", () => {
    const r = validarProposta(boa, agora);
    expect("dados" in r && r.dados.validaAte).toBe("2026-10-03T12:00:00.000Z");
  });

  it("recusa valor absurdo, condição vazia e validade fora da lista", () => {
    expect(validarProposta({ ...boa, valor: 50 }, agora)).toHaveProperty("erro");
    expect(validarProposta({ ...boa, condicao: "" }, agora)).toHaveProperty("erro");
    expect(validarProposta({ ...boa, validadeDias: 90 }, agora)).toHaveProperty("erro");
  });

  it("ignora id de imóvel que não é uuid", () => {
    const r = validarProposta({ ...boa, empreendimentoId: "'; drop" }, agora);
    expect("dados" in r && r.dados.empreendimentoId).toBeNull();
  });

  it("lê de volta e sabe quando venceu", () => {
    const r = validarProposta(boa, agora);
    const p = lerProposta(("dados" in r ? r.dados : {}) as Record<string, unknown>)!;
    expect(p.valor).toBe(480000);
    expect(propostaVencida(p, new Date("2026-10-04T00:00:00Z"))).toBe(true);
    expect(lerProposta({ imovel: 1 })).toBeNull();
  });

  it("vale a resposta mais recente", () => {
    expect(
      ultimaResposta([
        { tipo: "quer_conversar", created_at: "2026-09-26T10:00:00Z" },
        { tipo: "abriu", created_at: "2026-09-26T11:00:00Z" },
        { tipo: "aceitou", created_at: "2026-09-26T12:00:00Z" },
      ]),
    ).toBe("aceitou");
    expect(ultimaResposta([])).toBeNull();
  });
});
