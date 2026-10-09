/**
 * Os limites do número só andam para o lado conservador (09/10/2026).
 *
 * Decisão do dono da conta: "vamos ser bem conservadores com esses limites".
 * Veio depois de a conta da Bruna ser restringida pelo WhatsApp (07/10) e de a
 * lista do Ramos parar no teto de 15 de um número conectado havia dois dias.
 * Quem pedir mais volume ganha mais dias de uso ou mais números conectados,
 * nunca um limite maior.
 *
 * Esta guarda não impede apertar: teto menor, intervalo maior ou janela mais
 * curta passam. Ela reprova só o afrouxamento. Afrouxar é decisão do dono da
 * conta; quem fizer isso troca a referência abaixo, com a data e o motivo.
 *
 * A referência é a política em vigor em 09/10, escrita por extenso de
 * propósito: se a fórmula de `limiteDoDia` mudar (crescer mais, olhar mais
 * dias para trás, frear mais tarde), algum cenário passa da referência e a
 * guarda acusa, mesmo que nenhuma constante tenha mudado.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO,
  INTERVALO_MAXIMO_SEGUNDOS,
  INTERVALO_MINIMO_SEGUNDOS,
  limiteDiarioCampanha,
  limiteDoDia,
} from "./antiBan";

const HOJE = "2026-10-09";

/** O dia `offset` dias antes de HOJE, no formato do histórico. */
function diaAntes(offset: number): string {
  return new Date(Date.UTC(2026, 9, 9 - offset)).toISOString().slice(0, 10);
}

/** A política de 09/10/2026, congelada. Nada pode passar dela. */
function tetoDe0910(dias: number, historico: ReadonlyArray<{ offset: number; enviados: number }>, recusas: number) {
  if (dias < 0) return 0;
  const idade = dias < 3 ? 15 : dias < 7 ? 30 : dias < 14 ? 60 : dias < 30 ? 100 : 150;
  const recentes = historico.filter((h) => h.offset >= 1 && h.offset <= 7);
  const maiorDia = recentes.reduce((m, h) => Math.max(m, h.enviados), 0);
  const naSemana = recentes.reduce((s, h) => s + h.enviados, 0);
  const freio = recusas >= 3 && naSemana > 0 && recusas / naSemana >= 0.05;
  const porUso = Math.max(15, Math.round(maiorDia * (freio ? 1 : 1.5)));
  return Math.min(idade, porUso);
}

const IDADES = [0, 1, 2, 3, 4, 6, 7, 10, 13, 14, 20, 29, 30, 60, 365];
const RECUSAS = [0, 2, 3, 5, 50];
const HISTORICOS: ReadonlyArray<ReadonlyArray<{ offset: number; enviados: number }>> = [
  [],
  ...[1, 5, 10, 14, 15, 16, 20, 23, 30, 40, 60, 80, 100, 120, 150, 200, 500].map((enviados) => [{ offset: 1, enviados }]),
  [{ offset: 7, enviados: 100 }],
  [{ offset: 8, enviados: 100 }],
  [{ offset: 10, enviados: 150 }],
  [{ offset: 30, enviados: 150 }],
  [
    { offset: 1, enviados: 10 },
    { offset: 3, enviados: 40 },
  ],
  [
    { offset: 2, enviados: 80 },
    { offset: 9, enviados: 150 },
  ],
];

describe("limites do número: só para o lado conservador (09/10/2026)", () => {
  it("a curva por idade não passa de 15, 30, 60, 100 e 150", () => {
    for (const dias of IDADES) {
      expect(limiteDiarioCampanha(dias), `${dias} dias desde a conexão`).toBeLessThanOrEqual(tetoDe0910(dias, [{ offset: 1, enviados: 10_000 }], 0));
    }
  });

  it("o limite do dia nunca passa da política de 09/10, em nenhum cenário", () => {
    let cenarios = 0;
    for (const dias of IDADES) {
      for (const recusas of RECUSAS) {
        for (const historico of HISTORICOS) {
          const atual = limiteDoDia({
            diasDesdeConexao: dias,
            historico: historico.map((h) => ({ dia: diaAntes(h.offset), enviados: h.enviados })),
            hoje: HOJE,
            recusasNaSemana: recusas,
          }).limite;
          const teto = tetoDe0910(dias, historico, recusas);
          expect(atual, `${dias} dias, ${recusas} recusas, histórico ${JSON.stringify(historico)}`).toBeLessThanOrEqual(teto);
          cenarios++;
        }
      }
    }
    // Se o laço parar de rodar, a guarda aprova tudo sem olhar nada.
    expect(cenarios).toBeGreaterThan(1000);
  });

  it("o intervalo entre mensagens não fica menor que 1min30 a 2min", () => {
    expect(INTERVALO_MINIMO_SEGUNDOS).toBeGreaterThanOrEqual(90);
    expect(INTERVALO_MAXIMO_SEGUNDOS).toBeGreaterThanOrEqual(120);
    expect(INTERVALO_MAXIMO_SEGUNDOS).toBeGreaterThanOrEqual(INTERVALO_MINIMO_SEGUNDOS);
  });

  it("a janela de envio não cresce: 9h às 20h59, sem domingo", () => {
    expect(CONFIG_PADRAO.horaInicio).toBeGreaterThanOrEqual(9);
    expect(CONFIG_PADRAO.horaFim).toBeLessThanOrEqual(20);
    expect(CONFIG_PADRAO.permitirDomingo).toBe(false);
  });
});
