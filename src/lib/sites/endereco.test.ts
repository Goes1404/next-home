import { describe, expect, it } from "vitest";
import {
  ENDERECOS_DA_NEXT_HOME,
  ehHostDeDesenvolvimento,
  normalizarHost,
  slugDoEnderecoGratuito,
} from "./endereco";

describe("normalizarHost", () => {
  it("põe em minúsculas, tira porta, ponto final e espaços", () => {
    expect(normalizarHost("WWW.NextHomeImoveis.com")).toBe("www.nexthomeimoveis.com");
    expect(normalizarHost("localhost:3000")).toBe("localhost");
    expect(normalizarHost(" exemplo.com.br. ")).toBe("exemplo.com.br");
    expect(normalizarHost("127.0.0.1:57321")).toBe("127.0.0.1");
  });

  it("recusa o que não é nome de host (vazio, caminho, usuário, colchete)", () => {
    expect(normalizarHost("")).toBeNull();
    expect(normalizarHost(null)).toBeNull();
    expect(normalizarHost(undefined)).toBeNull();
    expect(normalizarHost("exemplo.com/s/outro")).toBeNull();
    expect(normalizarHost("user@exemplo.com")).toBeNull();
    expect(normalizarHost("[::1]:3000")).toBeNull();
    expect(normalizarHost("a..b")).toBeNull();
    expect(normalizarHost("-a.com")).toBeNull();
  });
});

describe("slugDoEnderecoGratuito", () => {
  it("devolve o slug do subdomínio do domínio da plataforma", () => {
    expect(slugDoEnderecoGratuito("imobiliaria-sol.plataforma.com.br", "plataforma.com.br")).toBe("imobiliaria-sol");
    expect(slugDoEnderecoGratuito("Imobiliaria-Sol.Plataforma.com.br", "PLATAFORMA.com.br")).toBe("imobiliaria-sol");
  });

  it("sem domínio da plataforma não há endereço gratuito", () => {
    expect(slugDoEnderecoGratuito("x.plataforma.com.br", undefined)).toBeNull();
    expect(slugDoEnderecoGratuito("x.plataforma.com.br", "")).toBeNull();
  });

  it("só um nível de subdomínio, e o próprio domínio não é site de grupo", () => {
    expect(slugDoEnderecoGratuito("a.b.plataforma.com.br", "plataforma.com.br")).toBeNull();
    expect(slugDoEnderecoGratuito("plataforma.com.br", "plataforma.com.br")).toBeNull();
    // Sufixo sem a fronteira do ponto não vale: xplataforma.com.br não é dela.
    expect(slugDoEnderecoGratuito("a.xplataforma.com.br", "plataforma.com.br")).toBeNull();
  });

  it("subdomínios reservados não viram grupo", () => {
    expect(slugDoEnderecoGratuito("www.plataforma.com.br", "plataforma.com.br")).toBeNull();
    expect(slugDoEnderecoGratuito("app.plataforma.com.br", "plataforma.com.br")).toBeNull();
  });
});

describe("ehHostDeDesenvolvimento", () => {
  it("localhost e 127.0.0.1 são da máquina de quem desenvolve", () => {
    expect(ehHostDeDesenvolvimento("localhost")).toBe(true);
    expect(ehHostDeDesenvolvimento("127.0.0.1")).toBe(true);
    expect(ehHostDeDesenvolvimento("nexthomeimoveis.com")).toBe(false);
    expect(ehHostDeDesenvolvimento("localhost.exemplo.com")).toBe(false);
  });
});

describe("ENDERECOS_DA_NEXT_HOME", () => {
  it("são os três endereços do grupo 1, já normalizados", () => {
    expect([...ENDERECOS_DA_NEXT_HOME].sort()).toEqual(
      ["next-home-drab.vercel.app", "nexthomeimoveis.com", "www.nexthomeimoveis.com"].sort(),
    );
    for (const h of ENDERECOS_DA_NEXT_HOME) expect(normalizarHost(h)).toBe(h);
  });
});
