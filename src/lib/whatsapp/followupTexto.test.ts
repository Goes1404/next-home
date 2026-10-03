import { describe, expect, it } from "vitest";
import {
  formatarVisitaSP,
  instrucaoDaRespostaAoPosVisita,
  instrucaoDoFollowup,
  JANELA_RESPOSTA_LEMBRETE_H,
  lerRespostaAoLembrete,
  respondeAoFollowup,
  respondeAoPosVisita,
} from "./followupTexto";

describe("instrução do follow-up (roadmap nº 6)", () => {
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

describe("o lembrete de véspera não inventa onde encontrar", () => {
  /*
   * A instrução anterior dizia "se fizer sentido, inclua um detalhe útil
   * (ponto de encontro...)" — um convite para inventar, no pior lugar
   * possível: o cliente lê na noite anterior, sai de casa e vai para onde a
   * mensagem mandou.
   */
  // `Partial` porque `tipo` e `tentativa` são os PADRÕES do atalho: com o tipo
  // completo eles seriam obrigatórios no `extra` e sobrescreveriam sempre,
  // deixando os defaults como enfeite — que é o que `tsc` acusava (TS2783).
  const lembrete = (extra: Partial<Parameters<typeof instrucaoDoFollowup>[0]> = {}) =>
    instrucaoDoFollowup({ tipo: "lembrete_visita", tentativa: 1, ...extra });

  it("com endereço cadastrado, manda copiar EXATAMENTE", () => {
    const texto = lembrete({
      tipo: "lembrete_visita",
      tentativa: 1,
      visitaFormatada: "segunda-feira, 14/09 às 9h",
      enderecoDoImovel: "Rua das Palmeiras, 100 — Jardim Tupanci",
      nomeDoImovel: "Terra Alta",
    });

    expect(texto).toContain("Rua das Palmeiras, 100 — Jardim Tupanci");
    expect(texto).toContain("EXATAMENTE");
    expect(texto).toContain("no Terra Alta");
  });

  it("sem endereço cadastrado, PROÍBE dizer qualquer um", () => {
    const texto = lembrete({ tipo: "lembrete_visita", tentativa: 1, enderecoDoImovel: null });

    expect(texto).toContain("NÃO diga endereço");
    expect(texto).toContain("corretor confirma o ponto de encontro");
  });

  it("continua sendo só sobre a visita", () => {
    const texto = lembrete({ tipo: "lembrete_visita", tentativa: 1 });
    expect(texto).toContain("NÃO reofereça outros imóveis");
  });
});

describe("pós-visita (26/09/2026)", () => {
  const texto = instrucaoDoFollowup({
    tipo: "pos_visita",
    tentativa: 1,
    nomeDoImovel: "Vitra Alphaville",
    visitaFormatada: "sábado, 26/09, às 10:00",
  });

  it("pergunta o que ele achou, citando o imóvel visitado", () => {
    expect(texto).toMatch(/PÓS-VISITA/);
    expect(texto).toContain("Vitra Alphaville");
    expect(texto).toMatch(/o que ele achou/);
  });

  it("proíbe reoferta, valor e pressão", () => {
    expect(texto).toMatch(/NÃO ofereça outros imóveis/);
    expect(texto).toMatch(/NÃO fale de valores/);
    expect(texto).toMatch(/NÃO pressione/);
  });
});

describe("resposta ao pós-visita", () => {
  const agora = new Date("2026-09-26T15:00:00Z");
  const enviado = "2026-09-26T12:00:00Z";

  it("vale quando o pós-visita foi a última palavra nossa", () => {
    const h = [
      { remetente: "bot", em: "2026-09-26T12:00:30Z" },
      { remetente: "cliente", em: "2026-09-26T14:59:00Z" },
    ];
    expect(respondeAoPosVisita(enviado, h, agora)).toBe(true);
  });

  it("não vale se a conversa já andou depois dele", () => {
    const h = [
      { remetente: "bot", em: "2026-09-26T12:00:30Z" },
      { remetente: "corretor", em: "2026-09-26T13:00:00Z" },
      { remetente: "cliente", em: "2026-09-26T14:59:00Z" },
    ];
    expect(respondeAoPosVisita(enviado, h, agora)).toBe(false);
  });

  it("não vale depois de 72h nem sem envio", () => {
    expect(respondeAoPosVisita("2026-09-22T12:00:00Z", [], agora)).toBe(false);
    expect(respondeAoPosVisita(null, [], agora)).toBe(false);
  });

  it("a instrução segue a resposta e não volta ao funil", () => {
    const t = instrucaoDaRespostaAoPosVisita();
    expect(t).toMatch(/simulação/);
    expect(t).toMatch(/UMA alternativa/);
    expect(t).toMatch(/NÃO fale valores/);
  });
});

describe("resposta ao lembrete da visita", () => {
  it("negação vence e vira remarcar", () => {
    expect(lerRespostaAoLembrete("Não vou conseguir amanhã")).toBe("remarcar");
    expect(lerRespostaAoLembrete("podemos remarcar pra semana?")).toBe("remarcar");
    expect(lerRespostaAoLembrete("não posso, mas sexta dá")).toBe("remarcar");
  });

  it("confirmação clara", () => {
    expect(lerRespostaAoLembrete("Confirmado! Estarei lá")).toBe("confirmou");
    expect(lerRespostaAoLembrete("👍")).toBe("confirmou");
    expect(lerRespostaAoLembrete("sim")).toBe("confirmou");
  });

  it("dúvida fica com o corretor", () => {
    expect(lerRespostaAoLembrete("qual o endereço mesmo?")).toBeNull();
  });

  it("responde ao follow-up pela janela do tipo", () => {
    const agora = new Date("2026-09-26T15:00:00Z");
    expect(respondeAoFollowup("2026-09-26T00:00:00Z", [], JANELA_RESPOSTA_LEMBRETE_H, agora)).toBe(true);
    expect(respondeAoFollowup("2026-09-24T00:00:00Z", [], JANELA_RESPOSTA_LEMBRETE_H, agora)).toBe(false);
  });
});
