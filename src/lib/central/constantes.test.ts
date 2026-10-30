import { describe, expect, it } from "vitest";
import { linkDoCentral, telefoneFormatado } from "./constantes";

describe("constantes do central", () => {
  it("formata o número com e sem o 55", () => {
    expect(telefoneFormatado("5511968671127")).toBe("(11) 96867-1127");
    expect(telefoneFormatado("11968671127")).toBe("(11) 96867-1127");
    expect(telefoneFormatado("1132345678")).toBe("(11) 3234-5678");
  });

  it("o link abre a conversa com o número da tabela, já com um oi", () => {
    expect(linkDoCentral("+55 (11) 96867-1127")).toBe("https://wa.me/5511968671127?text=oi");
  });
});
