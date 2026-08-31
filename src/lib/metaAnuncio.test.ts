import { describe, expect, it } from "vitest";
import { CAMPOS_DO_ANUNCIO, extrairIdsDoAnuncio } from "./metaAnuncio";

describe("extrairIdsDoAnuncio — o JSON da Meta vira a chave de junção do CPL", () => {
  it("lê anúncio, conjunto e campanha de uma resposta completa", () => {
    expect(
      extrairIdsDoAnuncio({
        id: "120210000000000001",
        name: "Manacá — carrossel 01",
        adset: { id: "120210000000000002", name: "Barueri 25-45" },
        campaign: { id: "120210000000000003", name: "Manacá — tráfego WhatsApp" },
      }),
    ).toEqual({
      nome: "Manacá — carrossel 01",
      anuncioId: "120210000000000001",
      conjuntoId: "120210000000000002",
      campanhaId: "120210000000000003",
    });
  });

  it("usa o ad_id do evento quando a resposta não traz o id", () => {
    const ids = extrairIdsDoAnuncio({ name: "Vitra — vídeo" }, "999888777");
    expect(ids.anuncioId).toBe("999888777");
    expect(ids.campanhaId).toBeNull();
  });

  /*
   * O caso que motivou a validação: a coluna é `text` e o JSON é externo.
   * Sem checar, `null` viraria a string "null" e um objeto viraria
   * "[object Object]" — lixo que casa com nenhuma linha de gasto e que só
   * aparece meses depois, quando alguém tenta fechar o CPL.
   */
  it("recusa qualquer coisa que não seja um ID de dígitos", () => {
    const ids = extrairIdsDoAnuncio({
      id: null,
      name: 42,
      adset: { id: { nested: true } },
      campaign: { id: "abc-123" },
    });
    expect(ids).toEqual({
      nome: null,
      anuncioId: null,
      conjuntoId: null,
      campanhaId: null,
    });
  });

  it("aceita ID numérico (a Meta às vezes manda number, às vezes string)", () => {
    expect(extrairIdsDoAnuncio({ campaign: { id: 12345 } }).campanhaId).toBe("12345");
  });

  it("não lança com resposta ausente, vazia ou de outro formato", () => {
    for (const corpo of [null, undefined, "", 0, [], "erro"]) {
      expect(() => extrairIdsDoAnuncio(corpo)).not.toThrow();
      expect(extrairIdsDoAnuncio(corpo).campanhaId).toBeNull();
    }
    // Mesmo sem corpo, o ad_id do evento se preserva.
    expect(extrairIdsDoAnuncio(null, "555").anuncioId).toBe("555");
  });

  it("trunca nome longo em vez de estourar a coluna", () => {
    expect(extrairIdsDoAnuncio({ name: "x".repeat(500) }).nome).toHaveLength(160);
  });

  /*
   * Esta é a regressão calada que o roadmap teme: se alguém simplificar a
   * chamada de volta para `fields=name`, a Graph API segue respondendo 200,
   * o lead segue nascendo, e só o CPL deixa de existir — sem erro nenhum.
   */
  it("pede adset e campaign na mesma chamada", () => {
    expect(CAMPOS_DO_ANUNCIO).toContain("adset{id");
    expect(CAMPOS_DO_ANUNCIO).toContain("campaign{id");
  });
});
