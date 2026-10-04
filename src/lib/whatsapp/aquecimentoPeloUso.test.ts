/**
 * O aquecimento pelo USO (0158).
 *
 * A curva antiga contava só os dias desde a conexão: número conectado há um
 * mês que nunca mandou nada ganhava 150 de uma vez, e número parado uma
 * semana voltava no volume máximo. O usuário apontou o risco ("se não
 * enviarem todo dia, as contas vão tomar ban"). Agora o limite parte do maior
 * dia da última semana e cresce 50% sobre ele; a idade fica como teto.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fraseDoLimite, limiteDoDia, PISO_POR_USO } from "./antiBan";

const HOJE = "2026-10-05";
const velho = 60; // dias desde a conexão: teto por idade = 150

describe("limite do dia pelo uso", () => {
  it("número velho e PARADO volta ao piso, não ao teto da idade", () => {
    const l = limiteDoDia({ diasDesdeConexao: velho, historico: [], hoje: HOJE, recusasNaSemana: 0 });
    expect(l.limite).toBe(PISO_POR_USO);
    expect(l.motivo).toBe("piso");
  });

  it("cresce 50% sobre o maior dia da última semana", () => {
    const l = limiteDoDia({
      diasDesdeConexao: velho,
      historico: [
        { dia: "2026-10-02", enviados: 20 },
        { dia: "2026-10-03", enviados: 40 },
      ],
      hoje: HOJE,
      recusasNaSemana: 0,
    });
    expect(l.limite).toBe(60);
    expect(l.motivo).toBe("uso");
    expect(l.maiorDiaRecente).toBe(40);
  });

  it("dia com mais de 7 dias não conta: uma semana parado zera o aquecimento", () => {
    const l = limiteDoDia({
      diasDesdeConexao: velho,
      historico: [{ dia: "2026-09-27", enviados: 100 }],
      hoje: HOJE,
      recusasNaSemana: 0,
    });
    expect(l.limite).toBe(PISO_POR_USO);
  });

  it("o próprio dia de hoje não alimenta o limite de hoje", () => {
    const l = limiteDoDia({
      diasDesdeConexao: velho,
      historico: [{ dia: HOJE, enviados: 80 }],
      hoje: HOJE,
      recusasNaSemana: 0,
    });
    expect(l.limite).toBe(PISO_POR_USO);
  });

  it("a idade continua sendo teto: número novo não passa da curva", () => {
    const l = limiteDoDia({
      diasDesdeConexao: 4, // teto por idade = 30
      historico: [{ dia: "2026-10-04", enviados: 30 }],
      hoje: HOJE,
      recusasNaSemana: 0,
    });
    expect(l.limite).toBe(30);
    expect(l.motivo).toBe("idade");
  });

  it("número não conectado não manda nada", () => {
    const l = limiteDoDia({ diasDesdeConexao: -1, historico: [], hoje: HOJE, recusasNaSemana: 0 });
    expect(l.limite).toBe(0);
  });

  it("muita gente pedindo para sair segura o crescimento", () => {
    const l = limiteDoDia({
      diasDesdeConexao: velho,
      historico: [{ dia: "2026-10-04", enviados: 40 }],
      hoje: HOJE,
      recusasNaSemana: 4, // 10% de 40
    });
    expect(l.limite).toBe(40);
    expect(l.motivo).toBe("freio");
  });

  it("poucas recusas num volume grande NÃO freiam", () => {
    const l = limiteDoDia({
      diasDesdeConexao: velho,
      historico: [{ dia: "2026-10-04", enviados: 100 }],
      hoje: HOJE,
      recusasNaSemana: 3, // 3%
    });
    expect(l.limite).toBe(150);
  });

  it("a sequência de uma lista grande sobe devagar, dia a dia", () => {
    let historico: { dia: string; enviados: number }[] = [];
    const limites: number[] = [];
    for (let d = 1; d <= 6; d++) {
      const dia = `2026-10-${String(d).padStart(2, "0")}`;
      const { limite } = limiteDoDia({ diasDesdeConexao: velho, historico, hoje: dia, recusasNaSemana: 0 });
      limites.push(limite);
      historico = [...historico, { dia, enviados: limite }];
    }
    expect(limites).toEqual([15, 23, 35, 53, 80, 120]);
  });

  it("toda saída tem frase em português", () => {
    for (const motivo of ["piso", "uso", "idade", "freio"] as const) {
      expect(fraseDoLimite({ limite: 20, motivo, maiorDiaRecente: 10 })).toMatch(/até 20/);
    }
  });
});

describe("quem usa o limite", () => {
  const raiz = join(__dirname, "../../..");
  const ler = (c: string) => readFileSync(join(raiz, c), "utf8");

  it("a reserva da cota usa o limite pelo uso, não a curva por idade", () => {
    const repo = ler("src/lib/whatsapp/repositorio.ts");
    const ini = repo.indexOf("export async function reservarCotaCampanha");
    const corpo = repo.slice(ini, repo.indexOf("consumir_cota_campanha_espacada", ini));
    expect(corpo).toContain("calcularLimiteDoDia(");
    expect(corpo).not.toContain("limiteDiarioCampanha(");
  });

  it("a tela de listas mostra o MESMO limite que a reserva usa", () => {
    const acoes = ler("src/app/corretor/(painel)/campanhas/acoes.ts");
    expect(acoes).toContain("calcularLimiteDoDia(");
    expect(acoes).not.toMatch(/saldoDiario\(/);
  });

  it("o histórico por dia é gravado no mesmo update que reserva a cota", () => {
    const sql = ler("supabase/migrations/0158_aquecimento_pelo_uso.sql");
    const fn = sql.slice(sql.indexOf("create or replace function public.consumir_cota_campanha_espacada"));
    const corpo = fn.slice(0, fn.indexOf("$function$;"));
    expect(corpo).toContain("insert into public.whatsapp_envios_por_dia");
  });
});
