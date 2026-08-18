import { describe, expect, it } from "vitest";
import { caminhoDoStorage, extensaoPorTipo, validarMidia } from "./midiaCorretor";

describe("validarMidia", () => {
  it("aceita um avatar dentro do limite", () => {
    expect(validarMidia("avatar", { size: 1024, type: "image/jpeg" })).toBeNull();
  });

  it("rejeita tipo não suportado", () => {
    expect(validarMidia("avatar", { size: 1024, type: "image/gif" })).toMatch(/Formato/);
  });

  it("rejeita avatar maior que 5MB", () => {
    expect(
      validarMidia("avatar", { size: 6 * 1024 * 1024, type: "image/jpeg" }),
    ).toMatch(/Máximo 5MB/);
  });

  it("aceita vídeo mp4 até 20MB", () => {
    expect(
      validarMidia("fundo_video", { size: 19 * 1024 * 1024, type: "video/mp4" }),
    ).toBeNull();
  });

  it("rejeita vídeo maior que 20MB", () => {
    expect(
      validarMidia("fundo_video", { size: 21 * 1024 * 1024, type: "video/mp4" }),
    ).toMatch(/Máximo 20MB/);
  });

  it("rejeita foto de fundo em formato de vídeo", () => {
    expect(validarMidia("fundo_foto", { size: 1024, type: "video/mp4" })).toMatch(/Formato/);
  });
});

describe("extensaoPorTipo", () => {
  it("mapeia tipos conhecidos", () => {
    expect(extensaoPorTipo("image/jpeg")).toBe("jpg");
    expect(extensaoPorTipo("video/mp4")).toBe("mp4");
  });

  it("cai para 'bin' em tipo desconhecido", () => {
    expect(extensaoPorTipo("application/x-nada")).toBe("bin");
  });
});

describe("caminhoDoStorage", () => {
  it("extrai o path depois do marcador do bucket público", () => {
    const url =
      "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/corretores/abc/avatar-123.jpg";
    expect(caminhoDoStorage(url)).toBe("corretores/abc/avatar-123.jpg");
  });

  it("retorna null pra URL que não é do bucket esperado", () => {
    expect(caminhoDoStorage("https://outro-dominio.com/imagem.jpg")).toBeNull();
  });
});
