import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturaValida } from "./metaWebhookSignature";

const SEGREDO = "segredo-de-teste";

function assinar(corpo: string, segredo = SEGREDO): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

describe("assinaturaValida", () => {
  it("aceita uma assinatura correta", () => {
    const corpo = '{"entry":[]}';
    expect(assinaturaValida(corpo, assinar(corpo), SEGREDO)).toBe(true);
  });

  it("rejeita quando o corpo foi alterado depois de assinado", () => {
    const assinatura = assinar('{"entry":[]}');
    expect(assinaturaValida('{"entry":["adulterado"]}', assinatura, SEGREDO)).toBe(false);
  });

  it("rejeita quando o segredo usado para assinar é outro", () => {
    const corpo = '{"entry":[]}';
    expect(assinaturaValida(corpo, assinar(corpo, "outro-segredo"), SEGREDO)).toBe(false);
  });

  it("rejeita header ausente", () => {
    expect(assinaturaValida('{"entry":[]}', null, SEGREDO)).toBe(false);
  });

  it("rejeita header sem o prefixo sha256=", () => {
    const corpo = '{"entry":[]}';
    const semPrefixo = assinar(corpo).replace("sha256=", "");
    expect(assinaturaValida(corpo, semPrefixo, SEGREDO)).toBe(false);
  });
});
