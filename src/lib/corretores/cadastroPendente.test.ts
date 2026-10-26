import { describe, expect, it } from "vitest";
import { cadastroEstaPendente, creciPendenteDoCadastro } from "./cadastroPendente";

describe("cadastro provisório de administrador", () => {
  it("tem marcador impossível de confundir com um CRECI preenchido", () => {
    expect(creciPendenteDoCadastro("abc-123")).toBe("PENDENTE-abc-123");
    expect(cadastroEstaPendente("PENDENTE-abc-123")).toBe(true);
    expect(cadastroEstaPendente("CRECI 12345-J")).toBe(false);
  });
});

import { creciParaExibir } from "./cadastroPendente";

describe("creciParaExibir", () => {
  it("esconde marcadores de cadastro incompleto", () => {
    expect(creciParaExibir("PENDENTE-abc")).toBeNull();
    expect(creciParaExibir("PREENCHER-ARETZ-ANDR")).toBeNull();
    expect(creciParaExibir("")).toBeNull();
    expect(creciParaExibir(null)).toBeNull();
    expect(creciParaExibir("SEM")).toBeNull();
  });
  it("mostra o CRECI de verdade", () => {
    expect(creciParaExibir("312798")).toBe("312798");
    expect(creciParaExibir(" 54478-J ")).toBe("54478-J");
  });
});
