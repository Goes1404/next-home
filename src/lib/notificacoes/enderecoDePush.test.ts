import { describe, expect, it } from "vitest";
import { ehEnderecoDePush } from "./enderecoDePush";

describe("endereço de push", () => {
  it("aceita os serviços dos navegadores", () => {
    expect(ehEnderecoDePush("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(ehEnderecoDePush("https://web.push.apple.com/QAbc")).toBe(true);
    expect(ehEnderecoDePush("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(ehEnderecoDePush("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("recusa qualquer outro destino (SSRF)", () => {
    for (const v of [
      "http://fcm.googleapis.com/x",
      "https://169.254.169.254/latest",
      "https://localhost/x",
      "https://evilfcm.googleapis.com.attacker.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://xfcm.googleapis.com/x",
      42,
    ]) {
      expect(ehEnderecoDePush(v)).toBe(false);
    }
  });
});
