import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/llm", () => ({
  algumProvedorConfigurado: vi.fn(() => true),
  chamarLlmJson: vi.fn(),
}));

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { agoraEmSaoPaulo } from "@/lib/crm/retornoPeloGrupo/ler";
import { interpretarPedido, montarPromptDoPedido, normalizarPedido } from "./interpretar";

const llmPadrao = vi.mocked(chamarLlmJson);

/** Terça, 27/10/2026, 12:00 em São Paulo. */
const AGORA = new Date("2026-10-27T15:00:00.000Z");
const NAO_ENTENDI = { tipo: "nao_entendi" };

function respostaOk(json: unknown) {
  return { ok: true, json, latenciaMs: 500, tokensEntrada: 800, tokensSaida: 60, modelo: "teste" } as const;
}

beforeEach(() => {
  llmPadrao.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("montarPromptDoPedido", () => {
  it("traz o AGORA no fuso de São Paulo e a mensagem", () => {
    const p = montarPromptDoPedido("visita com a Ana sábado 10h no Alpha", AGORA, false);
    expect(p).toContain("AGORA (fuso de São Paulo)");
    expect(p).toContain(agoraEmSaoPaulo(AGORA));
    expect(p).toContain("visita com a Ana sábado 10h no Alpha");
    expect(p).toContain("-03:00");
  });

  it("corretor não vê o tipo reunião; gestor vê", () => {
    expect(montarPromptDoPedido("oi", AGORA, false)).not.toContain('"reuniao"');
    const doGestor = montarPromptDoPedido("oi", AGORA, true);
    expect(doGestor).toContain('"reuniao"');
    expect(doGestor).toContain("reunião com Bruno e Carla sexta 15h às 16h sobre metas");
  });

  it("traz os exemplos de pedido", () => {
    const p = montarPromptDoPedido("oi", AGORA, true);
    for (const exemplo of [
      "visita com a Ana sábado 10h no Alpha",
      "amanhã das 14h às 16h estou no médico",
      "me lembra de ligar pro João quinta 9h",
      "o que eu tenho amanhã?",
      "reunião com a equipe toda segunda 9h",
    ]) {
      expect(p).toContain(exemplo);
    }
  });
});

describe("normalizarPedido — visita", () => {
  it("visita válida, com nomes aparados", () => {
    expect(
      normalizarPedido(
        { tipo: "marcar_visita", cliente: "  Ana ", quando: "2026-10-31T10:00:00-03:00", imovel: " Alpha " },
        AGORA,
        false,
      ),
    ).toEqual({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00-03:00", imovel: "Alpha" });
  });

  it("instante em UTC é reescrito no fuso de São Paulo", () => {
    expect(
      normalizarPedido({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T13:00:00Z" }, AGORA, false),
    ).toEqual({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00-03:00", imovel: null });
  });

  it("imóvel vazio vira null", () => {
    const r = normalizarPedido(
      { tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00-03:00", imovel: "  " },
      AGORA,
      false,
    );
    expect(r).toMatchObject({ imovel: null });
  });

  it("instante sem fuso: não entendi", () => {
    expect(
      normalizarPedido({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00" }, AGORA, false),
    ).toEqual(NAO_ENTENDI);
  });

  it("instante no passado: não entendi", () => {
    expect(
      normalizarPedido({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-26T10:00:00-03:00" }, AGORA, false),
    ).toEqual(NAO_ENTENDI);
  });

  it("instante a mais de um ano: não entendi (ano errado do modelo)", () => {
    expect(
      normalizarPedido({ tipo: "marcar_visita", cliente: "Ana", quando: "2027-11-01T10:00:00-03:00" }, AGORA, false),
    ).toEqual(NAO_ENTENDI);
  });

  it("sem cliente: não entendi", () => {
    expect(
      normalizarPedido({ tipo: "marcar_visita", cliente: " ", quando: "2026-10-31T10:00:00-03:00" }, AGORA, false),
    ).toEqual(NAO_ENTENDI);
  });
});

describe("normalizarPedido — bloqueio", () => {
  it("bloqueio com início e fim", () => {
    expect(
      normalizarPedido(
        { tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: "2026-10-28T16:00:00-03:00", motivo: " médico " },
        AGORA,
        false,
      ),
    ).toEqual({ tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: "2026-10-28T16:00:00-03:00", motivo: "médico" });
  });

  it("sem fim: uma hora depois do início", () => {
    expect(
      normalizarPedido({ tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: null }, AGORA, false),
    ).toEqual({ tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: "2026-10-28T15:00:00-03:00", motivo: null });
  });

  it("fim antes ou igual ao início: não entendi", () => {
    expect(
      normalizarPedido(
        { tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: "2026-10-28T13:00:00-03:00" },
        AGORA,
        false,
      ),
    ).toEqual(NAO_ENTENDI);
    expect(
      normalizarPedido(
        { tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: "2026-10-28T14:00:00-03:00" },
        AGORA,
        false,
      ),
    ).toEqual(NAO_ENTENDI);
  });

  it("fim escrito mas sem fuso: não entendi (não vira 1 hora em silêncio)", () => {
    expect(
      normalizarPedido({ tipo: "bloquear", inicio: "2026-10-28T14:00:00-03:00", fim: "2026-10-28T16:00" }, AGORA, false),
    ).toEqual(NAO_ENTENDI);
  });

  it("'agora até as 16h': início no minuto atual (segundos cortados) ainda vale", () => {
    expect(
      normalizarPedido(
        { tipo: "bloquear", inicio: "2026-10-27T11:59:00-03:00", fim: "2026-10-27T16:00:00-03:00" },
        new Date("2026-10-27T15:00:40.000Z"),
        false,
      ),
    ).toMatchObject({ tipo: "bloquear", inicio: "2026-10-27T11:59:00-03:00" });
  });
});

describe("normalizarPedido — lembrete", () => {
  it("lembrete com cliente", () => {
    expect(
      normalizarPedido(
        { tipo: "lembrete", cliente: " João ", texto: " ligar pro João ", quando: "2026-10-29T09:00:00-03:00" },
        AGORA,
        false,
      ),
    ).toEqual({ tipo: "lembrete", cliente: "João", texto: "ligar pro João", quando: "2026-10-29T09:00:00-03:00" });
  });

  it("cliente é opcional", () => {
    expect(
      normalizarPedido(
        { tipo: "lembrete", cliente: null, texto: "pagar condomínio", quando: "2026-10-29T09:00:00-03:00" },
        AGORA,
        false,
      ),
    ).toMatchObject({ cliente: null });
  });

  it("sem quando ou sem texto: não entendi", () => {
    expect(normalizarPedido({ tipo: "lembrete", texto: "ligar pro João", quando: null }, AGORA, false)).toEqual(
      NAO_ENTENDI,
    );
    expect(
      normalizarPedido({ tipo: "lembrete", texto: "", quando: "2026-10-29T09:00:00-03:00" }, AGORA, false),
    ).toEqual(NAO_ENTENDI);
  });
});

describe("normalizarPedido — consulta", () => {
  it("qualquer dia real vale, inclusive passado", () => {
    expect(normalizarPedido({ tipo: "consultar", dia: "2026-10-28" }, AGORA, false)).toEqual({
      tipo: "consultar",
      dia: "2026-10-28",
    });
    expect(normalizarPedido({ tipo: "consultar", dia: "2026-10-01" }, AGORA, false)).toEqual({
      tipo: "consultar",
      dia: "2026-10-01",
    });
  });

  it("dia que não existe ou fora do formato: não entendi", () => {
    expect(normalizarPedido({ tipo: "consultar", dia: "2026-02-30" }, AGORA, false)).toEqual(NAO_ENTENDI);
    expect(normalizarPedido({ tipo: "consultar", dia: "28/10/2026" }, AGORA, false)).toEqual(NAO_ENTENDI);
    expect(normalizarPedido({ tipo: "consultar" }, AGORA, false)).toEqual(NAO_ENTENDI);
  });
});

describe("normalizarPedido — reunião", () => {
  it("gestor marca reunião com a equipe; sem fim, uma hora; sem título, 'Reunião'", () => {
    expect(
      normalizarPedido(
        { tipo: "reuniao", titulo: null, inicio: "2026-11-02T09:00:00-03:00", participantes: "equipe" },
        AGORA,
        true,
      ),
    ).toEqual({
      tipo: "reuniao",
      titulo: "Reunião",
      inicio: "2026-11-02T09:00:00-03:00",
      fim: "2026-11-02T10:00:00-03:00",
      participantes: "equipe",
    });
  });

  it("nomes aparados, vazios e repetidos descartados", () => {
    expect(
      normalizarPedido(
        {
          tipo: "reuniao",
          titulo: " metas ",
          inicio: "2026-10-30T15:00:00-03:00",
          fim: "2026-10-30T16:00:00-03:00",
          participantes: [" Bruno ", "", "Carla", "Bruno", 7],
        },
        AGORA,
        true,
      ),
    ).toEqual({
      tipo: "reuniao",
      titulo: "metas",
      inicio: "2026-10-30T15:00:00-03:00",
      fim: "2026-10-30T16:00:00-03:00",
      participantes: ["Bruno", "Carla"],
    });
  });

  it("sem participantes: não entendi", () => {
    for (const participantes of [[], ["  "], null, "todo mundo"]) {
      expect(
        normalizarPedido({ tipo: "reuniao", inicio: "2026-11-02T09:00:00-03:00", participantes }, AGORA, true),
      ).toEqual(NAO_ENTENDI);
    }
  });

  it("corretor não marca reunião", () => {
    expect(
      normalizarPedido(
        { tipo: "reuniao", inicio: "2026-11-02T09:00:00-03:00", participantes: "equipe" },
        AGORA,
        false,
      ),
    ).toEqual(NAO_ENTENDI);
  });

  it("fim antes do início: não entendi", () => {
    expect(
      normalizarPedido(
        {
          tipo: "reuniao",
          inicio: "2026-11-02T09:00:00-03:00",
          fim: "2026-11-02T08:00:00-03:00",
          participantes: "equipe",
        },
        AGORA,
        true,
      ),
    ).toEqual(NAO_ENTENDI);
  });
});

describe("normalizarPedido — lixo", () => {
  it.each([null, undefined, "visita", 42, [], {}, { tipo: "desmarcar" }, { tipo: "nao_entendi" }])(
    "%j: não entendi",
    (json) => {
      expect(normalizarPedido(json, AGORA, true)).toEqual(NAO_ENTENDI);
    },
  );
});

describe("interpretarPedido", () => {
  it("chama o modelo com o prompt e temperatura 0.1 e devolve o pedido peneirado", async () => {
    const chamar = vi.fn().mockResolvedValue(
      respostaOk({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00-03:00", imovel: "Alpha" }),
    );
    const r = await interpretarPedido("visita com a Ana sábado 10h no Alpha", { agora: AGORA, ehGestor: false, chamar });
    expect(r).toEqual({ tipo: "marcar_visita", cliente: "Ana", quando: "2026-10-31T10:00:00-03:00", imovel: "Alpha" });
    expect(chamar).toHaveBeenCalledTimes(1);
    const [prompt, opcoes] = chamar.mock.calls[0];
    expect(prompt).toBe(montarPromptDoPedido("visita com a Ana sábado 10h no Alpha", AGORA, false));
    expect(opcoes).toMatchObject({ temperature: 0.1 });
  });

  it("sem `chamar`, usa o chamarLlmJson", async () => {
    llmPadrao.mockResolvedValue(respostaOk({ tipo: "consultar", dia: "2026-10-28" }));
    expect(await interpretarPedido("o que eu tenho amanhã?", { agora: AGORA, ehGestor: false })).toEqual({
      tipo: "consultar",
      dia: "2026-10-28",
    });
    expect(llmPadrao).toHaveBeenCalledTimes(1);
  });

  it("modelo falhou: não entendi", async () => {
    const chamar = vi.fn().mockResolvedValue({ ok: false, erro: "timeout", latenciaMs: 12000 });
    expect(await interpretarPedido("visita com a Ana", { agora: AGORA, ehGestor: false, chamar })).toEqual(NAO_ENTENDI);
  });

  it("modelo lançou: não entendi, sem lançar", async () => {
    const chamar = vi.fn().mockRejectedValue(new Error("rede"));
    expect(await interpretarPedido("visita com a Ana", { agora: AGORA, ehGestor: false, chamar })).toEqual(NAO_ENTENDI);
  });

  it("mensagem vazia: não entendi, sem chamar o modelo", async () => {
    const chamar = vi.fn();
    expect(await interpretarPedido("   ", { agora: AGORA, ehGestor: true, chamar })).toEqual(NAO_ENTENDI);
    expect(chamar).not.toHaveBeenCalled();
  });

  it("reunião pedida por corretor: não entendi mesmo que o modelo devolva", async () => {
    const chamar = vi
      .fn()
      .mockResolvedValue(respostaOk({ tipo: "reuniao", inicio: "2026-11-02T09:00:00-03:00", participantes: "equipe" }));
    expect(
      await interpretarPedido("reunião com a equipe toda segunda 9h", { agora: AGORA, ehGestor: false, chamar }),
    ).toEqual(NAO_ENTENDI);
  });
});
