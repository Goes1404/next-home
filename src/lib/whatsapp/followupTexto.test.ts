import { describe, expect, it } from "vitest";
import { formatarVisitaSP, instrucaoDoFollowup } from "./followupTexto";

describe("instrução do follow-up (roadmap nº 6)", () => {
  it("1ª tentativa com dossiê usa os ganchos concretos", () => {
    const i = instrucaoDoFollowup({
      tipo: "reengajamento",
      tentativa: 1,
      dossie: { regiaoInteresse: "Centro de Barueri", dormitoriosMin: 3 },
    });
    expect(i).toContain("Centro de Barueri");
    expect(i).toContain("3+ dormitórios");
    expect(i).toContain("FOLLOW-UP");
  });

  it("sem dossiê, ainda exige âncora concreta — nunca 'oi, tudo bem?'", () => {
    const i = instrucaoDoFollowup({ tipo: "reengajamento", tentativa: 1, dossie: null });
    expect(i).toContain("último assunto concreto");
    expect(i).toContain("não retoma nada");
  });

  it("2ª tentativa vira cutucada de UMA linha, sem anunciar que é a última", () => {
    const i = instrucaoDoFollowup({ tipo: "reengajamento", tentativa: 2, dossie: null });
    expect(i).toContain("SEGUNDO follow-up");
    expect(i).toContain("UMA linha");
    expect(i).toContain("sem dizer que é a última");
  });

  it("lembrete de visita fala SÓ da visita, com a data formatada", () => {
    const i = instrucaoDoFollowup({
      tipo: "lembrete_visita",
      tentativa: 1,
      visitaFormatada: "sábado, 30/08, às 10:00",
    });
    expect(i).toContain("LEMBRETE DE VISITA");
    expect(i).toContain("sábado, 30/08, às 10:00");
    expect(i).toContain("NÃO reofereça outros imóveis");
  });
});

describe("formatarVisitaSP — o fuso é São Paulo, nunca UTC", () => {
  it("21h de Brasília não vira o dia seguinte", () => {
    // 2026-08-29T21:00 em SP é 2026-08-30T00:00 UTC — a armadilha do
    // calendário do bot, que ensinava sábado com data de domingo.
    const f = formatarVisitaSP("2026-08-30T00:00:00Z");
    expect(f).toContain("29/08");
    expect(f).toContain("21:00");
    expect(f.toLowerCase()).toContain("sábado");
  });
});

/**
 * O caso que nasceu em 31/08, quando a campanha passou a agendar follow-up:
 * o cliente recebeu um disparo e nunca disse nada.
 */
describe("follow-up de quem nunca falou", () => {
  const nuncaFalou = (tentativa: number) =>
    instrucaoDoFollowup({ tipo: "reengajamento", tentativa, clienteNuncaFalou: true });

  it("proíbe a linguagem de retomada — não houve conversa para retomar", () => {
    const texto = nuncaFalou(1);
    expect(texto).toContain("ainda não falou nada nesta conversa");
    expect(texto).toContain("não houve conversa");
    expect(texto).toContain("NUNCA diga");
  });

  it("pede informação NOVA sobre o imóvel, não um 'oi, tudo bem?'", () => {
    expect(nuncaFalou(1)).toContain("informação concreta e nova");
  });

  it("na segunda tentativa é uma linha só, sem cobrança", () => {
    const texto = nuncaFalou(2);
    expect(texto).toContain("UMA linha");
    expect(texto).toContain("sem cobrar resposta");
    expect(texto).toContain("última tentativa");
  });

  /*
   * A instrução de quem JÁ conversou continua sendo outra: ela ancora no
   * dossiê e fala em retomada. Misturar as duas devolveria a frase falsa.
   */
  it("não contamina o caminho de quem já conversou", () => {
    const conversou = instrucaoDoFollowup({
      tipo: "reengajamento",
      tentativa: 1,
      dossie: { regiaoInteresse: "Alphaville", dormitoriosMin: 3 },
    });
    expect(conversou).toContain("Alphaville");
    expect(conversou).not.toContain("não houve conversa");
  });
});
