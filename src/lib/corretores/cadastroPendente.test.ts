import { describe, expect, it } from "vitest";
import { cadastroEstaPendente, creciPendenteDoCadastro } from "./cadastroPendente";

describe("cadastro provisório de administrador", () => {
  it("tem marcador impossível de confundir com um CRECI preenchido", () => {
    expect(creciPendenteDoCadastro("abc-123")).toBe("PENDENTE-abc-123");
    expect(cadastroEstaPendente("PENDENTE-abc-123")).toBe(true);
    expect(cadastroEstaPendente("CRECI 12345-J")).toBe(false);
  });
});
