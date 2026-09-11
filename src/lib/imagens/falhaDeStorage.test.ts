import { describe, expect, it } from "vitest";
import { classificarFalhaDeStorage } from "./falhaDeStorage";

describe("classificarFalhaDeStorage", () => {
  it("separa limite de tamanho, que o corretor resolve sozinho trocando a qualidade", () => {
    const f = classificarFalhaDeStorage("The object exceeded the maximum allowed size", "400");
    expect(f.motivo).toBe("tamanho");
    expect(f.valeTentarDeNovo).toBe(false);
    expect(f.mensagem).toMatch(/Rápida|formato menor/);
  });

  it("separa mime recusado, que é configuração do bucket", () => {
    const f = classificarFalhaDeStorage("mime type application/octet-stream is not supported", "400");
    expect(f.motivo).toBe("tipo");
    expect(f.valeTentarDeNovo).toBe(false);
  });

  it("o status não separa tamanho de tipo — os dois voltam 400", () => {
    expect(classificarFalhaDeStorage("The object exceeded the maximum allowed size", "400").motivo).toBe("tamanho");
    expect(classificarFalhaDeStorage("mime type image/avif is not supported", "400").motivo).toBe("tipo");
  });

  it("reconhece permissão pela mensagem e pelo status", () => {
    expect(classificarFalhaDeStorage("new row violates row-level security policy").motivo).toBe("permissao");
    expect(classificarFalhaDeStorage("Invalid JWT").motivo).toBe("permissao");
    expect(classificarFalhaDeStorage("qualquer coisa", 403).motivo).toBe("permissao");
  });

  it("reconhece bucket ausente", () => {
    expect(classificarFalhaDeStorage("Bucket not found", "404").motivo).toBe("bucket");
  });

  /*
   * `fetch failed` é rede da MÁQUINA. Marcar como permanente mandaria o
   * corretor avisar o suporte por uma oscilação de internet.
   */
  it("rede é o único motivo transitório de verdade", () => {
    for (const texto of ["TypeError: fetch failed", "ECONNRESET", "socket hang up", "The operation was aborted"]) {
      const f = classificarFalhaDeStorage(texto);
      expect(f.motivo, texto).toBe("rede");
      expect(f.valeTentarDeNovo, texto).toBe(true);
    }
    expect(classificarFalhaDeStorage("Internal Server Error", 503).motivo).toBe("rede");
  });

  it("sem mensagem nenhuma, não inventa causa — e deixa tentar de novo", () => {
    const f = classificarFalhaDeStorage(undefined, undefined);
    expect(f.motivo).toBe("desconhecido");
    expect(f.valeTentarDeNovo).toBe(true);
  });

  it("nenhum motivo permanente pede para tentar de novo", () => {
    for (const texto of ["exceeded the maximum allowed size", "mime type x is not supported", "Unauthorized", "Bucket not found"]) {
      expect(classificarFalhaDeStorage(texto).valeTentarDeNovo, texto).toBe(false);
    }
  });
});
