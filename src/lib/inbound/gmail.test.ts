import { describe, expect, it } from "vitest";
import { buscaDesde, emailDoIdToken, mensagemParaEmail, urlDeAutorizacao } from "./gmail";

const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64url");

describe("Gmail do corretor", () => {
  it("pede só leitura, offline e com consentimento (sem isso não vem refresh token)", () => {
    const u = new URL(urlDeAutorizacao({ clientId: "c", redirectUri: "https://x/api/gmail/retorno", state: "s" }));
    expect(u.searchParams.get("scope")).toContain("gmail.readonly");
    expect(u.searchParams.get("scope")).not.toMatch(/gmail\.(modify|send)|mail\.google\.com/);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });

  it("a busca olha só os portais, depois da última leitura", () => {
    const q = buscaDesde(new Date("2026-09-26T00:00:00Z"));
    expect(q).toContain("vivareal.com.br");
    expect(q).toContain("after:1790380800");
  });

  it("converte a mensagem com partes aninhadas", () => {
    const e = mensagemParaEmail({
      id: "abc",
      payload: {
        headers: [
          { name: "From", value: "ZAP <leads@zapimoveis.com.br>" },
          { name: "Subject", value: "Novo contato" },
        ],
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64("Ana 11 99999-0000") } },
          { mimeType: "multipart/related", parts: [{ mimeType: "text/html", body: { data: b64("<p>Ana</p>") } }] },
        ],
      },
    });
    expect(e.from).toContain("zapimoveis");
    expect(e.text).toBe("Ana 11 99999-0000");
    expect(e.html).toBe("<p>Ana</p>");
    expect(e.messageId).toBe("gmail:abc");
  });

  it("lê o e-mail do id_token e não quebra com lixo", () => {
    expect(emailDoIdToken(`x.${b64(JSON.stringify({ email: "a@b.com" }))}.y`)).toBe("a@b.com");
    expect(emailDoIdToken("lixo")).toBeNull();
    expect(emailDoIdToken(undefined)).toBeNull();
  });
});
