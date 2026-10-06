import { describe, expect, it, vi } from "vitest";
import {
  CONFIANCA_MINIMA,
  lerVeredito,
  montarPromptDeRecusa,
  recusaDoVeredito,
  temSinalNegativo,
} from "./recusaEmCamadas";

const llm = vi.hoisted(() => ({
  configurado: true,
  resposta: null as unknown,
  chamadas: 0,
}));
vi.mock("./llm", () => ({
  algumProvedorConfigurado: () => llm.configurado,
  chamarLlmJson: async () => {
    llm.chamadas++;
    if (llm.resposta instanceof Error) throw llm.resposta;
    return llm.resposta;
  },
}));

const { classificarRecusa } = await import("./classificarRecusa");

function respostaDaIA(json: unknown) {
  return { ok: true, json, latenciaMs: 300, tokensEntrada: 400, tokensSaida: 30, modelo: "gpt-4.1-mini" };
}

describe("filtro de sinal negativo", () => {
  it("passa o que tem cara de 'não'", () => {
    for (const fala of ["obrigado mas não", "deixa pra lá", "agora não", "n quero", "vou denunciar"]) {
      expect(temSinalNegativo(fala), fala).toBe(true);
    }
  });
  it("não gasta chamada com conversa sem sinal", () => {
    for (const fala of ["2 dormitórios", "Alphaville", "Qual o valor da entrada?", "sábado às 10h"]) {
      expect(temSinalNegativo(fala), fala).toBe(false);
    }
  });
  it("ignora o marcador de mensagem não gravada", () => {
    expect(temSinalNegativo("[mensagem não gravada]")).toBe(false);
  });
});

describe("leitura do veredito da IA", () => {
  const fala = "obrigado, mas não quero mais saber disso";

  it("aceita veredito com trecho copiado da fala", () => {
    expect(lerVeredito({ familia: "desinteresse", confianca: 0.9, trecho: "não quero mais saber" }, fala)).toEqual({
      familia: "desinteresse",
      confianca: 0.9,
      trecho: "não quero mais saber",
    });
  });
  it("recusa trecho que a IA inventou", () => {
    expect(lerVeredito({ familia: "parada", confianca: 0.95, trecho: "me tira da lista" }, fala)).toBeNull();
  });
  it("recusa família desconhecida e confiança fora de 0 a 1", () => {
    expect(lerVeredito({ familia: "talvez", confianca: 0.9, trecho: "não" }, fala)).toBeNull();
    expect(lerVeredito({ familia: "parada", confianca: 7, trecho: "não" }, fala)).toBeNull();
    expect(lerVeredito("lixo", fala)).toBeNull();
  });
  it("só vira recusa com confiança alta", () => {
    expect(recusaDoVeredito({ familia: "desinteresse", confianca: CONFIANCA_MINIMA - 0.01, trecho: "x" })).toBeNull();
    expect(recusaDoVeredito({ familia: "desinteresse", confianca: CONFIANCA_MINIMA, trecho: "x" })).toEqual({
      familia: "desinteresse",
      trecho: "x",
    });
    expect(recusaDoVeredito({ familia: "nenhuma", confianca: 1, trecho: "" })).toBeNull();
  });
  it("o prompt leva a última fala nossa como contexto", () => {
    const prompt = montarPromptDeRecusa({ ultimaFalaNossa: "Quer receber novidades?", falaDoCliente: "não" });
    expect(prompt).toContain("Quer receber novidades?");
    expect(prompt).toContain('"""não"""');
  });
});

describe("classificarRecusa: as camadas", () => {
  it("o que a regex pega não chega à IA", async () => {
    llm.chamadas = 0;
    const r = await classificarRecusa({ texto: "me tira da lista", ultimaFalaNossa: "" });
    expect(r.decididoPor).toBe("regex");
    expect(r.recusa?.familia).toBe("parada");
    expect(llm.chamadas).toBe(0);
  });

  it("mensagem sem sinal negativo não custa chamada", async () => {
    llm.chamadas = 0;
    const r = await classificarRecusa({ texto: "2 dormitórios em Barueri", ultimaFalaNossa: "" });
    expect(r.recusa).toBeNull();
    expect(llm.chamadas).toBe(0);
  });

  it("o duvidoso vai à IA, e com confiança alta vira recusa", async () => {
    llm.resposta = respostaDaIA({ familia: "parada", confianca: 0.93, trecho: "prefiro não receber essas coisas" });
    const r = await classificarRecusa({ texto: "prefiro não receber essas coisas", ultimaFalaNossa: "Oi! Tudo bem?" });
    expect(r.decididoPor).toBe("ia");
    expect(r.recusa).toEqual({ familia: "parada", trecho: "prefiro não receber essas coisas" });
    expect(r.modelo).toBe("gpt-4.1-mini");
  });

  it("confiança baixa fica registrada sem virar recusa", async () => {
    llm.resposta = respostaDaIA({ familia: "desinteresse", confianca: 0.5, trecho: "deixa pra lá" });
    const r = await classificarRecusa({ texto: "deixa pra lá", ultimaFalaNossa: "Quer ver a planta?" });
    expect(r.recusa).toBeNull();
    expect(r.veredito?.familia).toBe("desinteresse");
  });

  it("IA fora do ar: vale a regex sozinha, sem lançar", async () => {
    llm.resposta = { ok: false, erro: "timeout", latenciaMs: 4000 };
    expect((await classificarRecusa({ texto: "deixa pra lá", ultimaFalaNossa: "" })).recusa).toBeNull();
    llm.resposta = new Error("rede");
    expect((await classificarRecusa({ texto: "deixa pra lá", ultimaFalaNossa: "" })).recusa).toBeNull();
  });

  it("sem provedor configurado, nem tenta", async () => {
    llm.configurado = false;
    llm.chamadas = 0;
    await classificarRecusa({ texto: "deixa pra lá", ultimaFalaNossa: "" });
    expect(llm.chamadas).toBe(0);
    llm.configurado = true;
  });
});
