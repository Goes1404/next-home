import { describe, expect, it } from "vitest";
import { parsearLinkDrive } from "./drive";

describe("parsearLinkDrive", () => {
  it("lê link de pasta com sufixo de compartilhamento", () => {
    expect(parsearLinkDrive("https://drive.google.com/drive/folders/1A2b3C4d5E6f?usp=sharing")).toEqual({
      tipo: "pasta",
      id: "1A2b3C4d5E6f",
    });
  });

  it("lê link de pasta de Drive compartilhado", () => {
    expect(parsearLinkDrive("https://drive.google.com/drive/u/0/folders/1A2b3C4d5E6f")).toEqual({
      tipo: "pasta",
      id: "1A2b3C4d5E6f",
    });
  });

  it("lê link de arquivo único", () => {
    expect(parsearLinkDrive("https://drive.google.com/file/d/1XyZ_abc-123/view?usp=drive_link")).toEqual({
      tipo: "arquivo",
      id: "1XyZ_abc-123",
    });
  });

  it("lê o formato antigo com id na query", () => {
    expect(parsearLinkDrive("https://drive.google.com/open?id=1XyZ_abc-123")).toEqual({
      tipo: "arquivo",
      id: "1XyZ_abc-123",
    });
  });

  it("aceita espaço em volta, que é o que sai do copiar e colar", () => {
    expect(parsearLinkDrive("  https://drive.google.com/drive/folders/1A2b3C4d5E6f  ")).toEqual({
      tipo: "pasta",
      id: "1A2b3C4d5E6f",
    });
  });

  it("recusa link que não é do Drive, dizendo o que aceita", () => {
    const resultado = parsearLinkDrive("https://exemplo.com/fotos");

    expect(resultado.tipo).toBe("nao_reconhecido");
    expect((resultado as { motivo: string }).motivo).toContain("drive.google.com");
  });

  it("recusa texto que nem é URL", () => {
    expect(parsearLinkDrive("me manda as fotos").tipo).toBe("nao_reconhecido");
  });

  it("recusa host parecido com o do Google, que é o vetor óbvio de phishing", () => {
    expect(parsearLinkDrive("https://drive.google.com.exemplo.net/drive/folders/1A2b").tipo).toBe("nao_reconhecido");
  });
});
