import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RespostaAgenteIA } from "./aiAgent";

/*
 * A segunda tentativa quando a resposta era eco (29/09/2026).
 *
 * O modelo é trocado por um dublê: o que se testa é o CAMINHO do turno —
 * detectar que a resposta virou a frase pronta da guarda, chamar o modelo
 * de novo com a instrução contra repetição, e ficar com a resposta nova.
 */
const gerar = vi.fn();
vi.mock("./aiAgent", async (original) => ({
  ...(await original<typeof import("./aiAgent")>()),
  gerarRespostaIA: (...args: unknown[]) => gerar(...args),
}));

const { executarTurnoDeAtendimento } = await import("./turnoDeAtendimento");

const resposta = (textoResposta: string, latenciaMs = 2000): RespostaAgenteIA => ({
  textoResposta,
  sugerirVisita: false,
  transferirHumano: false,
  imoveisRecomendados: [],
  anexosMidia: [],
  mandarCatalogo: false,
  visitaProposta: null,
  meta: { latenciaMs, fallback: false, motivoFalha: null, modelo: "teste", tokensEntrada: 1, tokensSaida: 1 },
});

const REPETIDA = "O valor exato quem fecha é o corretor, na visita, com as condições da unidade que você escolher.";

const pedido = () => ({
  identidade: {
    nomeCorretor: "Bruna",
    creciCorretor: "1",
    telefoneCorretor: "5511999999999",
    nomeAssistente: "Lia",
    tomVoz: "",
  },
  catalogo: [],
  historico: [
    { remetente: "cliente", texto: "qual o valor exato?" },
    { remetente: "bot", texto: REPETIDA },
    { remetente: "cliente", texto: "mas qual o valor exato?" },
  ],
});

describe("resposta repetida é refeita pelo modelo", () => {
  beforeEach(() => gerar.mockReset());

  it("chama o modelo de novo, dizendo o que ele ia repetir, e usa a resposta nova", async () => {
    gerar
      .mockResolvedValueOnce(resposta(REPETIDA))
      .mockResolvedValueOnce(resposta("Esse número eu não tenho mesmo: quem monta é o corretor, com a unidade que você escolher."));

    const turno = await executarTurnoDeAtendimento(pedido() as never);

    expect(gerar).toHaveBeenCalledTimes(2);
    const segundaInstrucao = (gerar.mock.calls[1][0] as { instrucaoExtra?: string }).instrucaoExtra ?? "";
    expect(segundaInstrucao).toMatch(/repete o que você já disse/);
    expect(turno.resposta.textoResposta).toMatch(/não tenho mesmo/);
    expect(turno.resposta.meta.latenciaMs).toBe(4000);
  });

  it("sem tempo sobrando no orçamento, fica a frase pronta da guarda", async () => {
    gerar.mockResolvedValueOnce(resposta(REPETIDA, 24000));
    const turno = await executarTurnoDeAtendimento(pedido() as never);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(turno.resposta.textoResposta).not.toBe(REPETIDA);
  });

  it("resposta nova é chamada uma vez só", async () => {
    gerar.mockResolvedValueOnce(resposta("Oi! Me conta: em qual região de Barueri você procura?"));
    await executarTurnoDeAtendimento(pedido() as never);
    expect(gerar).toHaveBeenCalledTimes(1);
  });
});
