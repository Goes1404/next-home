import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listarPasta, parsearLinkDrive } from "./drive";

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

describe("listarPasta", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_API_KEY", "chave-de-teste");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("separa imagem de vídeo e ignora o resto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          files: [
            { id: "a", name: "fachada.jpg", mimeType: "image/jpeg", size: "3000000", thumbnailLink: "https://t/a" },
            { id: "b", name: "tour.mp4", mimeType: "video/mp4", size: "300000000" },
            { id: "c", name: "tabela.xlsx", mimeType: "application/vnd.ms-excel", size: "20000" },
          ],
        }),
      ),
    );

    const resultado = await listarPasta("pasta-1");

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.arquivos.map((a) => a.nome)).toEqual(["fachada.jpg", "tour.mp4"]);
    expect(resultado.arquivos[1].ehVideo).toBe(true);
  });

  it("pede à API os parâmetros de Drive compartilhado, senão a pasta volta vazia", async () => {
    const espiao = vi.fn(async () => Response.json({ files: [] }));
    vi.stubGlobal("fetch", espiao);

    await listarPasta("pasta-1");

    const chamada = String(espiao.mock.calls[0][0]);
    expect(chamada).toContain("supportsAllDrives=true");
    expect(chamada).toContain("includeItemsFromAllDrives=true");
  });

  it("explica em português que a pasta não está aberta quando o Google recusa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

    const resultado = await listarPasta("pasta-fechada");

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.erro).toMatch(/qualquer pessoa com o link/i);
  });

  it("diz que falta configurar quando não há chave, em vez de chamar a API sem ela", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    const resultado = await listarPasta("pasta-1");

    expect(resultado.ok).toBe(false);
    expect(espiao).not.toHaveBeenCalled();
  });
});
