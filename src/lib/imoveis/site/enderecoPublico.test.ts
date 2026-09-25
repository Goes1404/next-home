import { describe, expect, it } from "vitest";
import { enderecoProibido, validarUrlPublica } from "./enderecoPublico";

/**
 * A busca do importador abre um endereço que alguém COLOU. Cada linha abaixo
 * é um jeito conhecido de levar essa busca para dentro da rede de quem
 * hospeda a função (SSRF). Uma delas passando é uma porta aberta, e a
 * regressão é calada: a tela continua funcionando para os sites de verdade.
 */
describe("endereços que nunca podem ser buscados", () => {
  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://127.1.2.3/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.0.1/",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://metadata.google.internal/",
    "http://intranet/",
    "https://site.com.br:8080/",
    "file:///etc/passwd",
    "ftp://site.com.br/",
    "https://usuario:senha@site.com.br/",
    "não é url",
  ])("recusa %s", (url) => {
    expect(validarUrlPublica(url).ok).toBe(false);
  });
});

describe("sites de construtora", () => {
  it.each([
    "https://www.cyrela.com.br/empreendimentos/escape-brooklin",
    "http://construtora.com.br/imovel",
    "https://site.com.br:443/x",
    "https://8.8.8.8/",
  ])("aceita %s", (url) => {
    expect(validarUrlPublica(url).ok).toBe(true);
  });
});

describe("conferência do IP na hora da conexão", () => {
  it.each(["127.0.0.1", "10.1.1.1", "169.254.169.254", "::1", "fc00::1", "::ffff:10.0.0.1", "lixo"])(
    "%s é proibido",
    (ip) => expect(enderecoProibido(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "200.147.67.142", "2606:4700::6810:85e5"])("%s é público", (ip) =>
    expect(enderecoProibido(ip)).toBe(false),
  );
});
