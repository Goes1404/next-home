import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import {
  descricaoDaRecompensa,
  recompensarIndicacao,
  RECOMPENSA_DA_INDICACAO,
  registrarIndicacao,
  registrarIndicacaoDoPedido,
  statusDaIndicacao,
  valorEstimadoDoCredito,
} from "./indicacao";

/**
 * Indique e ganhe (0247, 29/10/2026): a atribuição (quem indicou quem) e a
 * recompensa no primeiro pagamento, uma vez só. O banco falso não tem as
 * chaves únicas da 0247; a idempotência que ele prova é a da conferência
 * antes do insert, e a da corrida (23505) é provada à parte.
 */

const INDICADORA = "11111111-1111-4111-8111-111111111111";
const INDICADA = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";

let banco: BancoFalso;
const servico = () => banco.cliente as never;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  banco = bancoFalso({
    grupos: [
      { id: INDICADORA, nome: "Imob Sol", codigo_de_indicacao: "sol12345", mensalidade: 297 },
      { id: INDICADA, nome: "Silva Seguros", codigo_de_indicacao: "silva999", mensalidade: 127 },
      { id: OUTRA, nome: "Advocacia Lima", codigo_de_indicacao: "lima0000", mensalidade: null },
    ],
    pedidos_de_contratacao: [
      { id: "pedido-1", codigo_de_indicacao: "sol12345" },
      { id: "pedido-2", codigo_de_indicacao: null },
    ],
    indicacoes: [],
    creditos_de_indicacao: [],
    // A linha de valor 0 do cadastro (0207) existe em toda conta e não conta.
    pagamentos_do_grupo: [{ id: "pag-0", grupo_id: INDICADA, competencia: "2026-10-01", valor: 0, pago_em: "2026-10-29" }],
  });
});

describe("a regra da recompensa", () => {
  it("é 50% de uma mensalidade, com a estimativa em reais pela mensalidade de quem indicou", () => {
    expect(RECOMPENSA_DA_INDICACAO).toEqual({ percentual: 50, meses: 1 });
    expect(descricaoDaRecompensa()).toBe("50% de desconto em 1 mensalidade");
    expect(valorEstimadoDoCredito(297)).toBe(148.5);
    expect(valorEstimadoDoCredito(null)).toBeNull();
    expect(valorEstimadoDoCredito(0)).toBeNull();
  });

  it("a situação deriva das linhas: aplicado > gerado > cancelada > aguardando", () => {
    expect(statusDaIndicacao({ credito: null, indicadaEncerrada: false })).toBe("aguardando_pagamento");
    expect(statusDaIndicacao({ credito: null, indicadaEncerrada: true })).toBe("conta_cancelada");
    expect(statusDaIndicacao({ credito: { aplicadoEm: null }, indicadaEncerrada: true })).toBe("credito_gerado");
    expect(statusDaIndicacao({ credito: { aplicadoEm: "2026-11-01" }, indicadaEncerrada: false })).toBe("credito_aplicado");
  });
});

describe("registrarIndicacao", () => {
  it("liga a conta nova à dona do código", async () => {
    const r = await registrarIndicacao(servico(), { codigo: " SOL12345 ", grupoIndicadoId: INDICADA, pedidoId: "pedido-1" });
    expect(r).toMatchObject({ resultado: "registrada", grupoIndicadorId: INDICADORA });
    expect(banco.tabelas.indicacoes).toEqual([
      expect.objectContaining({ codigo: "sol12345", grupo_indicador_id: INDICADORA, grupo_indicado_id: INDICADA, pedido_id: "pedido-1" }),
    ]);
  });

  it("sem código, código torto ou de ninguém: a conta nasce sem indicação", async () => {
    expect(await registrarIndicacao(servico(), { codigo: null, grupoIndicadoId: INDICADA })).toEqual({ resultado: "sem_codigo" });
    expect(await registrarIndicacao(servico(), { codigo: "x", grupoIndicadoId: INDICADA })).toEqual({ resultado: "sem_codigo" });
    expect(await registrarIndicacao(servico(), { codigo: "naoexiste", grupoIndicadoId: INDICADA })).toEqual({
      resultado: "codigo_desconhecido",
    });
    expect(banco.tabelas.indicacoes).toEqual([]);
  });

  it("ninguém indica a si mesmo", async () => {
    expect(await registrarIndicacao(servico(), { codigo: "silva999", grupoIndicadoId: INDICADA })).toEqual({
      resultado: "propria_conta",
    });
    expect(banco.tabelas.indicacoes).toEqual([]);
  });

  it("a conta já indicada (chave única da 0247) vira `ja_indicada`, sem erro", async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }),
    }));
    const cliente = {
      from: (tabela: string) =>
        tabela === "indicacoes"
          ? { insert }
          : banco.cliente.from(tabela),
    };
    expect(await registrarIndicacao(cliente as never, { codigo: "sol12345", grupoIndicadoId: INDICADA })).toEqual({
      resultado: "ja_indicada",
    });
  });

  it("pelo pedido: o código gravado no pedido vence o cookie do visitante", async () => {
    const r = await registrarIndicacaoDoPedido(servico(), {
      pedidoId: "pedido-1",
      grupoIndicadoId: INDICADA,
      codigoDoVisitante: "lima0000",
    });
    expect(r).toMatchObject({ resultado: "registrada", grupoIndicadorId: INDICADORA });
  });

  it("pelo pedido sem código: vale o cookie do visitante (teste grátis)", async () => {
    const r = await registrarIndicacaoDoPedido(servico(), {
      pedidoId: "pedido-2",
      grupoIndicadoId: INDICADA,
      codigoDoVisitante: "lima0000",
    });
    expect(r).toMatchObject({ resultado: "registrada", grupoIndicadorId: OUTRA });
  });

  it("pelo pedido sem código e sem cookie (conversão na plataforma): nada", async () => {
    expect(await registrarIndicacaoDoPedido(servico(), { pedidoId: "pedido-2", grupoIndicadoId: INDICADA })).toEqual({
      resultado: "sem_codigo",
    });
  });
});

describe("recompensarIndicacao", () => {
  async function indicar() {
    await registrarIndicacao(servico(), { codigo: "sol12345", grupoIndicadoId: INDICADA });
  }

  it("conta sem indicação: nada", async () => {
    banco.tabelas.pagamentos_do_grupo.push({ id: "pag-1", grupo_id: INDICADA, valor: 127, pago_em: "2026-11-04" });
    expect(await recompensarIndicacao(servico(), INDICADA)).toEqual({ resultado: "sem_indicacao" });
    expect(banco.tabelas.creditos_de_indicacao).toEqual([]);
  });

  it("a linha de valor 0 do cadastro não é o primeiro pagamento", async () => {
    await indicar();
    expect(await recompensarIndicacao(servico(), INDICADA)).toEqual({ resultado: "sem_pagamento" });
    expect(banco.tabelas.creditos_de_indicacao).toEqual([]);
  });

  it("o primeiro pagamento de verdade gera o crédito de quem indicou", async () => {
    await indicar();
    banco.tabelas.pagamentos_do_grupo.push({ id: "pag-1", grupo_id: INDICADA, valor: 127, pago_em: "2026-11-04" });
    const r = await recompensarIndicacao(servico(), INDICADA);
    expect(r).toMatchObject({ resultado: "gerado", grupoBeneficiadoId: INDICADORA, valorEstimado: 148.5 });
    expect(banco.tabelas.creditos_de_indicacao).toEqual([
      expect.objectContaining({
        grupo_beneficiado_id: INDICADORA,
        pagamento_id: "pag-1",
        percentual: 50,
        meses: 1,
        valor_estimado: 148.5,
        descricao: "50% de desconto em 1 mensalidade",
      }),
    ]);
  });

  it("idempotente: o evento repetido e o segundo pagamento não geram outro crédito", async () => {
    await indicar();
    banco.tabelas.pagamentos_do_grupo.push({ id: "pag-1", grupo_id: INDICADA, valor: 127, pago_em: "2026-11-04" });
    expect((await recompensarIndicacao(servico(), INDICADA)).resultado).toBe("gerado");
    expect(await recompensarIndicacao(servico(), INDICADA)).toEqual({ resultado: "ja_recompensada" });
    banco.tabelas.pagamentos_do_grupo.push({ id: "pag-2", grupo_id: INDICADA, valor: 127, pago_em: "2026-12-04" });
    expect(await recompensarIndicacao(servico(), INDICADA)).toEqual({ resultado: "ja_recompensada" });
    expect(banco.tabelas.creditos_de_indicacao).toHaveLength(1);
  });

  it("na corrida, a chave única (23505) vira `ja_recompensada`", async () => {
    await indicar();
    banco.tabelas.pagamentos_do_grupo.push({ id: "pag-1", grupo_id: INDICADA, valor: 127, pago_em: "2026-11-04" });
    const cliente = {
      from: (tabela: string) => {
        const q = banco.cliente.from(tabela);
        if (tabela !== "creditos_de_indicacao") return q;
        return {
          ...q,
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "dup" } }) }) }),
        };
      },
    };
    expect(await recompensarIndicacao(cliente as never, INDICADA)).toEqual({ resultado: "ja_recompensada" });
  });

  it("erro do banco vira `falhou`, nunca exceção (o pagamento já está gravado)", async () => {
    const cliente = {
      from: () => {
        throw new Error("rede caiu");
      },
    };
    expect(await recompensarIndicacao(cliente as never, INDICADA)).toEqual({ resultado: "falhou", motivo: "rede caiu" });
  });
});

describe("os caminhos que registram pagamento chamam a recompensa", () => {
  it("o registro à mão, o webhook do Asaas, o teste grátis e a conversão do pedido estão ligados", async () => {
    const { readFileSync } = await import("node:fs");
    const ler = (f: string) => readFileSync(f, "utf8");
    expect(ler("src/app/plataforma/cobrancaAcoes.ts")).toMatch(/recompensarIndicacao\(servico, grupoId\)/);
    expect(ler("src/lib/cobranca/webhookDoAsaas.ts")).toMatch(/recompensarIndicacao\(servico, grupo\.id\)/);
    expect(ler("src/lib/plataforma/testeGratis.ts")).toMatch(/registrarIndicacaoDoPedido\(/);
    expect(ler("src/lib/plataforma/testeGratis.ts")).toMatch(/codigo_de_indicacao: codigoDeIndicacao/);
    expect(ler("src/app/plataforma/pedidosAcoes.ts")).toMatch(/registrarIndicacaoDoPedido\(servico, \{ pedidoId: id, grupoIndicadoId: grupo \}\)/);
  });
});
