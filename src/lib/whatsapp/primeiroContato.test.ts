import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  amanhaCedoEmSaoPaulo,
  diasDesde,
  DIAS_SEM_PRIMEIRO_CONTATO,
  inicioDoPrimeiroContato,
  motivoDoPrimeiroContato,
  PRIMEIRO_CONTATO_POR_DIA,
  PRIMEIRO_CONTATO_POR_SEMANA,
  vagasDePrimeiroContato,
} from "./primeiroContato";

/*
 * Primeiro contato (0217, 26/10/2026): o WhatsApp do Ramos foi desconectado
 * da conta depois de 48 mensagens em dois dias para gente que nunca tinha
 * falado com ele, todas com a mesma foto. O teto próprio e a quarentena de
 * número novo são o que impede o próximo.
 */

describe("vagas de primeiro contato", () => {
  it("nenhuma nos primeiros dias depois de conectar ou voltar de uma queda", () => {
    for (let d = 0; d < DIAS_SEM_PRIMEIRO_CONTATO; d++) {
      expect(vagasDePrimeiroContato({ diasDesdeInicio: d, enviadosHoje: 0, enviadosNaSemana: 0 })).toBe(0);
    }
    expect(
      vagasDePrimeiroContato({ diasDesdeInicio: DIAS_SEM_PRIMEIRO_CONTATO, enviadosHoje: 0, enviadosNaSemana: 0 }),
    ).toBe(PRIMEIRO_CONTATO_POR_DIA);
  });

  it("o teto do dia e o da semana valem juntos", () => {
    expect(vagasDePrimeiroContato({ diasDesdeInicio: 30, enviadosHoje: 4, enviadosNaSemana: 4 })).toBe(6);
    expect(vagasDePrimeiroContato({ diasDesdeInicio: 30, enviadosHoje: 10, enviadosNaSemana: 10 })).toBe(0);
    expect(vagasDePrimeiroContato({ diasDesdeInicio: 30, enviadosHoje: 0, enviadosNaSemana: 27 })).toBe(3);
    expect(vagasDePrimeiroContato({ diasDesdeInicio: 30, enviadosHoje: 0, enviadosNaSemana: 40 })).toBe(0);
  });

  it("o caso do Ramos não passaria: 21 e 27 num número que voltou havia dias", () => {
    // Em 20/10 o teto do dia seria 10, e a semana fecharia em 30, não em 48.
    expect(vagasDePrimeiroContato({ diasDesdeInicio: 13, enviadosHoje: 10, enviadosNaSemana: 10 })).toBe(0);
    expect(vagasDePrimeiroContato({ diasDesdeInicio: 14, enviadosHoje: 0, enviadosNaSemana: 30 })).toBe(0);
  });

  it("dia inválido conta como número novo", () => {
    expect(vagasDePrimeiroContato({ diasDesdeInicio: Number.NaN, enviadosHoje: 0, enviadosNaSemana: 0 })).toBe(0);
  });

  it("os tetos só podem apertar", () => {
    expect(PRIMEIRO_CONTATO_POR_DIA).toBeLessThanOrEqual(10);
    expect(PRIMEIRO_CONTATO_POR_SEMANA).toBeLessThanOrEqual(30);
    expect(DIAS_SEM_PRIMEIRO_CONTATO).toBeGreaterThanOrEqual(7);
  });
});

describe("início da contagem", () => {
  const conexao = new Date("2026-10-07T16:54:00Z");
  const queda = new Date("2026-10-21T12:51:00Z");

  it("a volta da queda reinicia a contagem", () => {
    expect(inicioDoPrimeiroContato(conexao, queda)).toEqual(queda);
    expect(inicioDoPrimeiroContato(queda, conexao)).toEqual(queda);
    expect(inicioDoPrimeiroContato(conexao, null)).toEqual(conexao);
    expect(inicioDoPrimeiroContato(null, null)).toBeNull();
  });

  it("dias inteiros, para baixo, e zero sem início", () => {
    expect(diasDesde(queda, new Date("2026-10-28T12:50:00Z"))).toBe(6);
    expect(diasDesde(queda, new Date("2026-10-28T12:52:00Z"))).toBe(7);
    expect(diasDesde(null)).toBe(0);
  });
});

describe("motivo e reagendamento", () => {
  it("o motivo diz quantos dias faltam no número novo", () => {
    expect(motivoDoPrimeiroContato({ diasDesdeInicio: 5 })).toMatch(/Faltam 2 dias/);
    expect(motivoDoPrimeiroContato({ diasDesdeInicio: 6 })).toMatch(/Faltam 1 dia\./);
    expect(motivoDoPrimeiroContato({ diasDesdeInicio: 20 })).toMatch(/10 por dia e 30 por semana/);
  });

  it("amanhã às 9h de São Paulo, inclusive depois das 21h, quando em UTC já é amanhã", () => {
    expect(amanhaCedoEmSaoPaulo(new Date("2026-10-26T15:00:00Z"), 0)).toBe("2026-10-27T12:00:00.000Z");
    expect(amanhaCedoEmSaoPaulo(new Date("2026-10-27T01:30:00Z"), 0)).toBe("2026-10-27T12:00:00.000Z");
    expect(amanhaCedoEmSaoPaulo(new Date("2026-10-31T15:00:00Z"), 15)).toBe("2026-11-01T12:15:00.000Z");
  });
});

describe("o disparador aplica a regra", () => {
  const codigo = readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("decide o primeiro contato antes de reservar a cota", () => {
    const decisao = codigo.indexOf("vagasDePrimeiroContato(");
    expect(decisao).toBeGreaterThan(0);
    expect(decisao).toBeLessThan(codigo.indexOf("reservarCotaCampanha(instancia.id"));
  });

  it("grava a marca no envio e não manda foto no primeiro contato", () => {
    expect(codigo).toContain("primeiro_contato: primeiroContato");
    expect(codigo).toMatch(/midias\.length > 0 && !primeiroContato/);
  });

  it("em dúvida, trata como primeiro contato", () => {
    const funcao = codigo.slice(codigo.indexOf("async function nuncaFalouComOCorretor"));
    const corpo = funcao.slice(0, funcao.indexOf("\n}\n"));
    expect(corpo).toMatch(/if \(!leadId\) return true/);
    expect(corpo).toMatch(/if \(error\) return true/);
    expect(corpo).toMatch(/if \(erroDaContagem\) return true/);
  });
});
