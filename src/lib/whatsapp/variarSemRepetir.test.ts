import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A reescrita com a IA fingida: o que importa aqui é o que o código faz com a
 * resposta (conferir, recusar, pedir de novo com o motivo), não o modelo.
 */
const chamarLlmJson = vi.fn();
vi.mock("./llm", () => ({
  algumProvedorConfigurado: () => true,
  chamarLlmJson: (...args: unknown[]) => chamarLlmJson(...args),
}));

const { variarSemRepetir } = await import("./campaignQueue");

const FATOS = ["Dom Parque", "Jardim Tupanci"];
const ORIGINAL =
  "Olá, Ana! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te mande os detalhes?";
const ANTERIOR = {
  texto:
    "Oi Bruno! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te envie os detalhes?",
  nomes: ["Bruno"],
};
const BOA =
  "Ana, tudo certo? Saiu uma condição nova no Dom Parque, lá no Jardim Tupanci, e pensei em você. Posso te mandar como ficou?";
const COPIA =
  "Oi Ana! Tudo bem? Lembrei do seu interesse e acabou de surgir uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te mande os detalhes?";

function responde(mensagem: string) {
  return { ok: true, json: { mensagem } };
}

const base = { texto: ORIGINAL, nome: "Ana", nomes: ["Ana"], fatos: FATOS, semente: 3 };

describe("reescrita que não repete o número", () => {
  beforeEach(() => chamarLlmJson.mockReset());

  it("aceita a primeira reescrita que passa na conferência e fica diferente", async () => {
    chamarLlmJson.mockResolvedValueOnce(responde(BOA));
    const r = await variarSemRepetir({ ...base, anteriores: [ANTERIOR] });
    expect(r).toMatchObject({ ok: true, texto: BOA, personalizadoPorIA: true });
    if (r.ok) expect(r.semelhanca).toBeLessThan(0.7);
    expect(chamarLlmJson).toHaveBeenCalledTimes(1);
  });

  it("recusa a cópia e pede de novo, mostrando com o que ela se pareceu", async () => {
    chamarLlmJson.mockResolvedValueOnce(responde(COPIA)).mockResolvedValueOnce(responde(BOA));
    const r = await variarSemRepetir({ ...base, anteriores: [ANTERIOR] });
    expect(r).toMatchObject({ ok: true, texto: BOA });
    const segundoPedido = chamarLlmJson.mock.calls[1][0] as string;
    expect(segundoPedido).toMatch(/parecida com uma mensagem que o número já mandou/);
    // A mensagem de outra pessoa vai para a IA sem o nome dela.
    expect(segundoPedido).toContain("Oi [nome]!");
    expect(segundoPedido).not.toContain("Bruno");
  });

  it("recusa reescrita que perdeu um fato e diz qual", async () => {
    chamarLlmJson
      .mockResolvedValueOnce(responde("Ana, tudo certo? Saiu condição nova lá no Jardim Tupanci, e pensei em você. Posso te mandar como ficou?"))
      .mockResolvedValueOnce(responde(BOA));
    const r = await variarSemRepetir({ ...base, anteriores: [] });
    expect(r).toMatchObject({ ok: true, texto: BOA });
    expect(chamarLlmJson.mock.calls[1][0]).toContain('faltou "Dom Parque" escrito igual');
  });

  it("sem reescrita aproveitável, o original repetido não sai", async () => {
    chamarLlmJson.mockResolvedValue(responde(COPIA));
    const r = await variarSemRepetir({ ...base, texto: COPIA, anteriores: [ANTERIOR] });
    expect(r).toMatchObject({ ok: false, motivo: "parecida" });
    expect(chamarLlmJson).toHaveBeenCalledTimes(2);
  });

  it("IA fora do ar: não insiste, e o original só sai se for inédito", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "timeout" });
    const inedito = await variarSemRepetir({ ...base, anteriores: [] });
    expect(inedito).toMatchObject({ ok: true, texto: ORIGINAL, personalizadoPorIA: false });
    expect(chamarLlmJson).toHaveBeenCalledTimes(1);

    const repetido = await variarSemRepetir({ ...base, anteriores: [ANTERIOR] });
    expect(repetido).toMatchObject({ ok: false, motivo: "ia_indisponivel" });
  });

  it("formata para o WhatsApp antes de conferir", async () => {
    chamarLlmJson.mockResolvedValueOnce(responde(`**Ana**, tudo certo? ${BOA.slice("Ana, tudo certo? ".length)}`));
    const r = await variarSemRepetir({ ...base, anteriores: [] });
    expect(r.ok && r.texto.startsWith("*Ana*, tudo certo?")).toBe(true);
  });

  it("no teste A/B a IA é avisada para manter a abertura", async () => {
    chamarLlmJson.mockResolvedValueOnce(responde(BOA));
    await variarSemRepetir({ ...base, anteriores: [], manterAbertura: true });
    expect(chamarLlmJson.mock.calls[0][0]).toContain("teste entre duas aberturas");
  });
});
