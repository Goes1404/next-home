import { describe, expect, it } from "vitest";
import { aReceberDasConstrutoras, extratoDo, repassesAPagar, situacaoDoRepasse, type VendaDoExtrato } from "./extrato";
import type { Parcela } from "./parcelas";

const parcela = (p: Partial<Parcela> = {}): Parcela => ({
  id: "p1",
  numero: 1,
  valor: 10000,
  pagador: "construtora",
  venceEm: "2026-11-10",
  recebidaEm: null,
  canceladaEm: null,
  ...p,
});

const venda = (p: Partial<VendaDoExtrato> = {}): VendaDoExtrato => ({
  id: "v1",
  imovel: "Dom Parque",
  construtora: "P4",
  unidade: "101",
  dataVenda: "2026-10-01",
  valorVenda: 400000,
  comissaoValor: 20000,
  status: "ativa",
  parcelas: [parcela({ id: "a" }), parcela({ id: "b", numero: 2, venceEm: "2026-12-10" })],
  participantes: [
    { corretorId: "c1", nome: "Bruna", partePercentual: 100, repasseValor: 8000, repassePagoEm: null, formaRecebimento: "repasse" },
  ],
  ...p,
});

const HOJE = "2026-11-20";

describe("situação do repasse com parcelas", () => {
  it("nada recebido: aguardando a construtora", () => {
    const v = venda();
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("aguardando_construtora");
  });

  it("parte recebida: parcial, com o liberado proporcional", () => {
    const v = venda({ parcelas: [parcela({ id: "a", recebidaEm: "2026-11-10" }), parcela({ id: "b", numero: 2 })] });
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("parcial");
    const e = extratoDo("c1", [v], HOJE);
    expect(e.linhas[0].liberado).toBe(4000);
    expect(e.liberado).toBe(4000);
    expect(e.aReceber).toBe(8000);
  });

  it("tudo recebido: pode pagar", () => {
    const v = venda({
      parcelas: [parcela({ id: "a", recebidaEm: "2026-11-10" }), parcela({ id: "b", numero: 2, recebidaEm: "2026-11-15" })],
    });
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("pode_pagar");
  });

  it("quem recebe direto não tem repasse a receber da imobiliária", () => {
    const v = venda({
      participantes: [
        { corretorId: "c1", nome: "Bruna", partePercentual: 100, repasseValor: 8000, repassePagoEm: null, formaRecebimento: "direto" },
      ],
    });
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("recebe_direto");
    expect(extratoDo("c1", [v], HOJE).aReceber).toBe(0);
  });

  it("distrato que cancela a parcela aberta reduz o que o corretor tem a receber", () => {
    const v = venda({
      status: "distratada",
      parcelas: [parcela({ id: "a", recebidaEm: "2026-11-10" }), parcela({ id: "b", numero: 2, canceladaEm: "2026-11-15" })],
    });
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("pode_pagar");
    expect(extratoDo("c1", [v], HOJE).aReceber).toBe(4000);
  });

  it("distrato que cancela tudo: nada a receber", () => {
    const v = venda({ status: "distratada", parcelas: [parcela({ id: "a", canceladaEm: "2026-11-15" })] });
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("distratada");
    expect(extratoDo("c1", [v], HOJE).aReceber).toBe(0);
  });

  it("pago continua pago, distratada ou não", () => {
    const v = venda({
      status: "distratada",
      participantes: [
        { corretorId: "c1", nome: "Bruna", partePercentual: 100, repasseValor: 8000, repassePagoEm: "2026-11-01", formaRecebimento: "repasse" },
      ],
    });
    expect(situacaoDoRepasse(v, v.participantes[0])).toBe("pago");
  });
});

describe("visão do gestor com parcelas", () => {
  it("a receber das construtoras soma só as parcelas abertas", () => {
    const v = venda({ parcelas: [parcela({ id: "a", recebidaEm: "2026-11-10" }), parcela({ id: "b", numero: 2 })] });
    const r = aReceberDasConstrutoras([v], HOJE);
    expect(r[0].total).toBe(10000);
  });

  it("repasses a pagar separam o liberado do aguardando", () => {
    const v = venda({ parcelas: [parcela({ id: "a", recebidaEm: "2026-11-10" }), parcela({ id: "b", numero: 2 })] });
    const [r] = repassesAPagar([v]);
    expect([r.liberado, r.aguardando]).toEqual([4000, 4000]);
  });
});
