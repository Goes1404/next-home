import { describe, expect, it } from "vitest";
import {
  calcularRisco,
  contasEmRisco,
  nivelDoRisco,
  PESOS_DO_RISCO,
  resumoDosRiscos,
  whatsappForaDesde,
  type ContaEmRisco,
  type SinaisDeRisco,
} from "./riscoDeCancelamento";

/**
 * O risco de cancelamento (29/10/2026): cada sinal, os limites (7 dias sem
 * login, queda de mais da metade com base mínima, 3 dias sem WhatsApp), o
 * nível e o resumo do aviso das 9h.
 */

const AGORA = new Date("2026-10-29T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

const SAUDAVEL: SinaisDeRisco = {
  ultimoLoginDaEquipe: diasAtras(1),
  leadsUltimasDuasSemanas: 20,
  leadsDuasSemanasAntes: 22,
  whatsappForaDesde: null,
  mensalidadeEmAberto: false,
  chamadosAbertos: 0,
};

const risco = (s: Partial<SinaisDeRisco>) => calcularRisco({ ...SAUDAVEL, ...s }, AGORA);

describe("calcularRisco", () => {
  it("conta saudável: zero pontos, risco baixo, sem motivo", () => {
    expect(risco({})).toEqual({ pontos: 0, nivel: "baixo", motivos: [] });
  });

  it("sem login há 7 dias (ou nunca) pesa 30", () => {
    expect(risco({ ultimoLoginDaEquipe: diasAtras(6) }).pontos).toBe(0);
    const r = risco({ ultimoLoginDaEquipe: diasAtras(8) });
    expect(r.pontos).toBe(PESOS_DO_RISCO.semLogin);
    expect(r.nivel).toBe("medio");
    expect(r.motivos[0].texto).toBe("Ninguém da equipe entra há 8 dias");
    expect(risco({ ultimoLoginDaEquipe: null }).motivos[0].texto).toBe("Ninguém da equipe entrou ainda");
  });

  it("queda de leads: mais da metade, e só com base mínima de 4", () => {
    expect(risco({ leadsUltimasDuasSemanas: 5, leadsDuasSemanasAntes: 10 }).pontos).toBe(0);
    const r = risco({ leadsUltimasDuasSemanas: 4, leadsDuasSemanasAntes: 10 });
    expect(r.pontos).toBe(PESOS_DO_RISCO.quedaDeLeads);
    expect(r.motivos[0].texto).toContain("caíram 60%");
    // Conta pequena: 0 contra 3 não é sinal (base mínima).
    expect(risco({ leadsUltimasDuasSemanas: 0, leadsDuasSemanasAntes: 3 }).pontos).toBe(0);
  });

  it("WhatsApp fora há mais de 3 dias pesa 20", () => {
    expect(risco({ whatsappForaDesde: diasAtras(2) }).pontos).toBe(0);
    const r = risco({ whatsappForaDesde: diasAtras(4) });
    expect(r.pontos).toBe(PESOS_DO_RISCO.whatsappFora);
    expect(r.motivos[0].texto).toBe("WhatsApp fora do ar há 4 dias");
  });

  it("mensalidade em aberto e chamados abertos", () => {
    expect(risco({ mensalidadeEmAberto: true }).pontos).toBe(PESOS_DO_RISCO.mensalidadeEmAberto);
    expect(risco({ chamadosAbertos: 1 }).pontos).toBe(PESOS_DO_RISCO.chamadoAberto);
    expect(risco({ chamadosAbertos: 3 }).pontos).toBe(PESOS_DO_RISCO.muitosChamados);
    expect(risco({ chamadosAbertos: 3 }).motivos[0].texto).toBe("3 chamados de suporte abertos");
  });

  it("os sinais somam e o motivo mais pesado vem primeiro", () => {
    const r = risco({ ultimoLoginDaEquipe: null, mensalidadeEmAberto: true, chamadosAbertos: 1 });
    expect(r.pontos).toBe(60);
    expect(r.nivel).toBe("alto");
    expect(r.motivos.map((m) => m.chave)).toEqual(["semLogin", "mensalidadeEmAberto", "chamadoAberto"]);
  });

  it("tudo junto não passa de 100", () => {
    const r = risco({
      ultimoLoginDaEquipe: null,
      leadsUltimasDuasSemanas: 0,
      leadsDuasSemanasAntes: 10,
      whatsappForaDesde: diasAtras(10),
      mensalidadeEmAberto: true,
      chamadosAbertos: 5,
    });
    expect(r.pontos).toBeLessThanOrEqual(105);
    expect(r.nivel).toBe("alto");
  });

  it("os níveis: 50 alto, 25 médio", () => {
    expect(nivelDoRisco(49)).toBe("medio");
    expect(nivelDoRisco(50)).toBe("alto");
    expect(nivelDoRisco(24)).toBe("baixo");
    expect(nivelDoRisco(25)).toBe("medio");
  });
});

describe("whatsappForaDesde", () => {
  const instancia = (p: Partial<Parameters<typeof whatsappForaDesde>[0][number]>) => ({
    status_conexao: "desconectado",
    desconectado_em: null,
    sessao_caida_em: null,
    conectado_em: null,
    created_at: diasAtras(60),
    ...p,
  });

  it("algum número conectado: não está fora", () => {
    expect(whatsappForaDesde([instancia({}), instancia({ status_conexao: "conectado" })], diasAtras(90))).toBeNull();
  });

  it("nunca conectou: fora desde a criação da conta", () => {
    expect(whatsappForaDesde([], diasAtras(5))).toBe(diasAtras(5));
  });

  it("todos fora: a data mais recente em que algum dava sinal", () => {
    const desde = whatsappForaDesde(
      [instancia({ desconectado_em: diasAtras(10) }), instancia({ sessao_caida_em: diasAtras(4) })],
      diasAtras(90),
    );
    expect(desde).toBe(diasAtras(4));
  });
});

describe("o aviso das 9h", () => {
  const conta = (nome: string, s: Partial<SinaisDeRisco>): ContaEmRisco => ({ grupoId: nome, nome, risco: risco(s) });

  it("sem conta em risco, sem aviso", () => {
    expect(resumoDosRiscos([conta("Boa", {})])).toBeNull();
  });

  it("até três contas, da mais arriscada, com o motivo principal; o resto vira 'e mais N'", () => {
    const lista = [
      conta("Média", { mensalidadeEmAberto: true, chamadosAbertos: 1 }),
      conta("Boa", {}),
      conta("Alta", { ultimoLoginDaEquipe: null, mensalidadeEmAberto: true }),
      conta("Outra", { whatsappForaDesde: diasAtras(5), chamadosAbertos: 1 }),
      conta("Mais uma", { ultimoLoginDaEquipe: diasAtras(9) }),
    ];
    // Empate de pontos (30 cada): ordem alfabética.
    expect(contasEmRisco(lista).map((c) => c.nome)).toEqual(["Alta", "Mais uma", "Média", "Outra"]);
    const r = resumoDosRiscos(lista)!;
    expect(r.titulo).toBe("4 contas em risco de cancelamento (1 alto)");
    expect(r.corpo).toBe(
      "Alta (ninguém da equipe entrou ainda); Mais uma (ninguém da equipe entra há 9 dias); Média (mensalidade em aberto); e mais 1.",
    );
  });

  it("o aviso só leva nome de conta e motivo: nada de cliente", () => {
    const r = resumoDosRiscos([conta("Silva Seguros", { mensalidadeEmAberto: true, chamadosAbertos: 2 })])!;
    expect(r.titulo).toBe("1 conta em risco de cancelamento");
    expect(r.corpo).toBe("Silva Seguros (mensalidade em aberto).");
  });
});
