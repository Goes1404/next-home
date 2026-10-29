import { describe, expect, it } from "vitest";
import { colunasDaLista, LISTA_GUARDADA_VALE_MS, listaGuardada, listaVencida } from "./gruposGuardados";

/*
 * A lista de grupos do número central guardada no grupo (0234): com o número
 * em 255 grupos a Evolution levava ~40 s e a aba Roleta desistia nos 15 s.
 */

const GRUPO = { jid: "120363012345678901@g.us", nome: "Ana & ARETZ" };

describe("lista de grupos guardada", () => {
  it("vale só para o número central de agora", () => {
    const linha = { ...colunasDaLista("central-a", [GRUPO]) };
    expect(listaGuardada(linha, "central-a")?.grupos).toEqual([GRUPO]);
    expect(listaGuardada(linha, "central-b")).toBeNull();
  });

  it("sem lista, sem data ou com lixo na coluna: não há lista (lê de novo)", () => {
    expect(listaGuardada(null, "c")).toBeNull();
    expect(listaGuardada({ grupos_whatsapp_instancia: "c", grupos_whatsapp_do_central: [GRUPO], grupos_whatsapp_lidos_em: null }, "c")).toBeNull();
    expect(listaGuardada({ grupos_whatsapp_instancia: "c", grupos_whatsapp_do_central: "x", grupos_whatsapp_lidos_em: "2026-10-29T17:00:00Z" }, "c")).toBeNull();
    const torta = listaGuardada(
      { grupos_whatsapp_instancia: "c", grupos_whatsapp_do_central: [GRUPO, { jid: 1 }, null, { nome: "sem jid" }], grupos_whatsapp_lidos_em: "2026-10-29T17:00:00Z" },
      "c",
    );
    expect(torta?.grupos).toEqual([GRUPO]);
  });

  it("vence depois de 10 minutos, e data ilegível conta como vencida", () => {
    const agora = new Date("2026-10-29T17:00:00Z");
    expect(listaVencida(new Date(agora.getTime() - LISTA_GUARDADA_VALE_MS + 1000).toISOString(), agora)).toBe(false);
    expect(listaVencida(new Date(agora.getTime() - LISTA_GUARDADA_VALE_MS - 1000).toISOString(), agora)).toBe(true);
    expect(listaVencida("não é data", agora)).toBe(true);
  });

  it("grava só jid e nome, com a instância e a hora da leitura", () => {
    const agora = new Date("2026-10-29T17:00:00Z");
    expect(colunasDaLista("central", [{ ...GRUPO, extra: 1 } as typeof GRUPO], agora)).toEqual({
      grupos_whatsapp_do_central: [GRUPO],
      grupos_whatsapp_instancia: "central",
      grupos_whatsapp_lidos_em: "2026-10-29T17:00:00.000Z",
    });
  });
});
