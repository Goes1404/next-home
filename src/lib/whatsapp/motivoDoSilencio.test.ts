import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { botDeveResponder, motivoDoSilencio } from "./repositorio";

/**
 * O bot cala por TRÊS razões diferentes, e por três dias o banco disse que
 * era sempre a mesma.
 *
 * Medido em 03/09/2026: 335 mensagens de cliente puladas em três dias, todas
 * gravadas como `pausada_por_humano` — e, conferindo o estado real das
 * conversas, a pausa não era a causa de NENHUMA delas (9 travadas pela
 * palavra-chave, 1 com o bot desligado, 7 com a pausa já vencida). O rótulo
 * mandava consertar a única coisa que não estava quebrada.
 *
 * A regressão aqui falha CALADA: o webhook segue respondendo 200, o cliente
 * segue sendo pulado, e só uma consulta no banco revelaria que o motivo
 * voltou a ser um chute. Por isso a segunda metade LÊ O CÓDIGO-FONTE — a
 * mesma classe de guarda que `gravacaoDeMensagem` e `escalaDoPainel` usam.
 */

type Conversa = Parameters<typeof motivoDoSilencio>[0];

const conversa = (over: Partial<Conversa>): Conversa => ({
  id: "c1",
  leadId: null,
  telefoneCliente: "5511999999999",
  botAtivo: true,
  pausadoHumanoAte: null,
  liberadoPorPalavraChave: true,
  clienteConhecido: false,
  eTeste: false,
  origem: "organica",
  ...over,
});

const daquiAHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe("motivoDoSilencio", () => {
  it("devolve null quando o bot pode falar", () => {
    expect(motivoDoSilencio(conversa({}))).toBeNull();
  });

  it("separa as três causas", () => {
    expect(motivoDoSilencio(conversa({ botAtivo: false }))).toBe("bot_desligado");
    expect(motivoDoSilencio(conversa({ pausadoHumanoAte: daquiAHoras(1) }))).toBe(
      "pausada_por_humano",
    );
    expect(motivoDoSilencio(conversa({ liberadoPorPalavraChave: false }))).toBe(
      "aguardando_palavra_chave",
    );
  });

  it("pausa VENCIDA não é motivo — foi o caso de 7 conversas reais", () => {
    expect(motivoDoSilencio(conversa({ pausadoHumanoAte: daquiAHoras(-1) }))).toBeNull();
  });

  it("a precedência é estável quando duas causas valem ao mesmo tempo", () => {
    // Sem ordem fixa, a mesma conversa cairia ora numa causa ora noutra e a
    // soma por motivo deixaria de fechar com o total de silêncios.
    expect(motivoDoSilencio(conversa({ botAtivo: false, liberadoPorPalavraChave: false }))).toBe(
      "bot_desligado",
    );
    expect(
      motivoDoSilencio(
        conversa({ pausadoHumanoAte: daquiAHoras(1), liberadoPorPalavraChave: false }),
      ),
    ).toBe("pausada_por_humano");
  });

  it("botDeveResponder concorda com motivoDoSilencio em toda combinação", () => {
    for (const botAtivo of [true, false])
      for (const pausadoHumanoAte of [null, daquiAHoras(1), daquiAHoras(-1)])
        for (const liberadoPorPalavraChave of [true, false]) {
          const c = conversa({ botAtivo, pausadoHumanoAte, liberadoPorPalavraChave });
          expect(botDeveResponder(c)).toBe(motivoDoSilencio(c) === null);
        }
  });
});

describe("o webhook grava o motivo real", () => {
  // Comentário que CITA o rótulo antigo não é uso dele — remover antes de
  // acusar, senão a guarda reprova a própria explicação (já aconteceu duas
  // vezes nesta base).
  const fonte = readFileSync(
    join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("decide o motivo por função, não por rótulo fixo", () => {
    expect(fonte).toContain("motivoDoSilencio(conversa)");
  });

  it('não volta a carimbar "pausada_por_humano" à mão', () => {
    expect(fonte).not.toMatch(/acao:\s*"pausada_por_humano"/);
  });
});
