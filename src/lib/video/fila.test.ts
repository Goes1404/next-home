import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROTULO_STATUS, saldoDisponivel, TRAVA_MINUTOS, MAX_TENTATIVAS } from "./videoTipos";

describe("saldoDisponivel", () => {
  it("soma o que sobrou da cota com o crédito avulso", () => {
    expect(saldoDisponivel({ cotaMensal: 5, usadosNoCiclo: 2, creditosAvulsos: 3 })).toBe(6);
  });

  it("cota estourada não vira saldo negativo comendo o avulso", () => {
    // Sem o piso em zero, um corretor que gastou 7 de uma cota de 5 apareceria
    // com 1 crédito a menos do que comprou.
    expect(saldoDisponivel({ cotaMensal: 5, usadosNoCiclo: 7, creditosAvulsos: 2 })).toBe(2);
  });

  it("sem nada é zero, nunca NaN na tela", () => {
    expect(saldoDisponivel({ cotaMensal: 0, usadosNoCiclo: 0, creditosAvulsos: 0 })).toBe(0);
  });
});

describe("os rótulos de estado", () => {
  it("falam português de gente, não vocabulário de fila", () => {
    expect(ROTULO_STATUS.pendente).toBe("Na fila");
    expect(ROTULO_STATUS.renderizando).toBe("Montando o vídeo");
    for (const r of Object.values(ROTULO_STATUS)) {
      expect(r).not.toMatch(/job|queue|render(izando)?$|status|pending/i);
    }
  });
});

describe("as constantes da fila", () => {
  it("a trava dura mais que o pior render medido (174 s), com folga", () => {
    expect(TRAVA_MINUTOS * 60).toBeGreaterThan(174 * 2);
  });

  it("o teto de tentativas não deixa um job insistir para sempre", () => {
    expect(MAX_TENTATIVAS).toBeGreaterThanOrEqual(2);
    expect(MAX_TENTATIVAS).toBeLessThanOrEqual(5);
  });
});

/*
 * Guardas de código-fonte. As três regressões que elas pegam falham CALADAS:
 * o vídeo continua saindo e ninguém percebe que a cobrança quebrou.
 */
describe("as guardas da cobrança", () => {
  const fila = readFileSync(join(process.cwd(), "src/lib/video/fila.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("reserva o crédito ANTES de inserir o job", () => {
    // Inverter a ordem abre a janela em que dois pedidos simultâneos viram
    // dois renders com um crédito só — a corrida que este desenho fecha.
    const iReserva = fila.indexOf("reservar_credito_video");
    const iInsert = fila.indexOf('.from("video_jobs")\n    .insert');
    expect(iReserva).toBeGreaterThan(-1);
    expect(iInsert).toBeGreaterThan(-1);
    expect(iReserva).toBeLessThan(iInsert);
  });

  it("devolve o crédito quando o job não chega a existir e quando falha de vez", () => {
    // Reservar antes do trabalho é o que fecha a corrida; sem devolução, uma
    // falha nossa cobra um vídeo que nunca existiu.
    const devolucoes = fila.match(/devolver_credito_video/g) ?? [];
    expect(devolucoes.length).toBeGreaterThanOrEqual(2);
  });

  it("a trava do worker é UPDATE condicional, não leitura seguida de escrita", () => {
    // `.eq("status", "pendente")` no próprio UPDATE é o que faz dois workers
    // correndo resultarem em um levando e o outro recebendo zero linhas.
    expect(fila).toMatch(/\.update\(\{ status: "renderizando"[\s\S]{0,220}\.eq\("status", "pendente"\)/);
  });

  it("toda escrita usa a service key — authenticated só tem SELECT", () => {
    const escritas = fila.match(/\.(insert|update|rpc)\(/g) ?? [];
    expect(escritas.length).toBeGreaterThan(4);
    // O cliente de sessão só aparece na leitura da lista do corretor.
    expect(fila.match(/await createClient\(\)/g)?.length ?? 0).toBe(1);
  });
});

describe("a migration da fila", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0092_video_jobs.sql"), "utf8");

  it("fecha o anon nas duas tabelas — tabela nova nasce aberta para ele", () => {
    expect(sql).toMatch(/revoke all on public\.video_jobs from anon/);
    expect(sql).toMatch(/revoke all on public\.video_creditos from anon/);
  });

  it("tira a escrita do authenticated: cota que ele escreve é cota que ele forja", () => {
    expect(sql).toMatch(/revoke insert, update, truncate on public\.video_jobs from authenticated/);
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.video_creditos from authenticated/);
  });

  it("o débito serializa com FOR UPDATE, senão dois pedidos passam juntos", () => {
    expect(sql).toMatch(/for update/i);
  });

  it("o ciclo vira no fuso de São Paulo, não em UTC", () => {
    // Em UTC, das 21h à meia-noite de Brasília já é o dia seguinte — e às
    // vezes o mês. O ciclo viraria cedo e daria cota de graça.
    expect(sql).toMatch(/at time zone 'America\/Sao_Paulo'/);
    expect(sql).not.toMatch(/current_date(?!\s*at time zone)/i);
  });
});
