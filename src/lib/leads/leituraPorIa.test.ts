import { beforeEach, describe, expect, it, vi } from "vitest";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a) }));

import { extrairDeTexto } from "./importacao";
import { conferirLeituraDaIa, dividirEmPedacos, nomeEstaNoTexto, telefoneEstaNoTexto } from "./leituraPorIa";

const LISTA = `1. Carlos Souza — whats 11 91234-5678, visita sábado
2. Fernanda Lima, tel: +55 (11) 93456-7890, fernanda.lima@hotmail.com
3. Pedro, 11 3456-7890 (fixo) / 11 99988-7766 (cel)`;

const respondeu = (json: unknown) => ({ ok: true, json, latenciaMs: 1, tokensEntrada: 1, tokensSaida: 1, modelo: "teste" });

beforeEach(() => chamarLlmJson.mockReset());

describe("lista de leads sem cabeçalho lida pela IA", () => {
  it("preenche nome, telefone, e-mail e observação de cada contato", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({
        leads: [
          { nome: "Carlos Souza", telefone: "11 91234-5678", email: null, mensagem: "Visita sábado", imovelInteresse: null },
          { nome: "Fernanda Lima", telefone: "+55 (11) 93456-7890", email: "fernanda.lima@hotmail.com", mensagem: null, imovelInteresse: null },
          { nome: "Pedro", telefone: "11 99988-7766", email: null, mensagem: "Tem também fixo", imovelInteresse: null },
        ],
      }),
    );
    const r = await extrairDeTexto(LISTA);
    expect(r.metodo).toBe("ia");
    expect(r.candidatos.map((c) => [c.nome, c.telefoneE164, c.email])).toEqual([
      ["Carlos Souza", "5511912345678", null],
      ["Fernanda Lima", "5511934567890", "fernanda.lima@hotmail.com"],
      ["Pedro", "5511999887766", null],
    ]);
    expect(r.candidatos[0].mensagem).toBe("Visita sábado");
  });

  it("descarta o telefone que não está na lista", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({ leads: [{ nome: "Carlos Souza", telefone: "11 90000-1111" }, { nome: "Pedro", telefone: "11 99988-7766" }] }),
    );
    const r = await extrairDeTexto(LISTA);
    expect(r.candidatos.map((c) => c.nome)).toEqual(["Pedro"]);
  });

  it("não aceita nome que a lista não tem, nem e-mail inventado", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({ leads: [{ nome: "Pedro Henrique Alves", telefone: "11 99988-7766", email: "pedro@gmail.com" }] }),
    );
    const r = await extrairDeTexto(LISTA);
    expect(r.candidatos[0].nome).toBe("Contato sem nome");
    expect(r.candidatos[0].email).toBeNull();
  });

  it("tabela com cabeçalho não gasta chamada de IA", async () => {
    const r = await extrairDeTexto("nome;telefone\nAna Prado;11 98888-7777");
    expect(r.metodo).toBe("tabela");
    expect(chamarLlmJson).not.toHaveBeenCalled();
  });

  it("sem IA, lê linha a linha e avisa para conferir", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "sem_api_key", latenciaMs: 0 });
    const r = await extrairDeTexto(LISTA);
    expect(r.candidatos.length).toBeGreaterThan(0);
    expect(r.aviso).toMatch(/IA não respondeu/);
  });
});

describe("conferência da resposta", () => {
  it("aceita o telefone com o 55 que o modelo acrescenta, e recusa dígito a mais", () => {
    expect(telefoneEstaNoTexto("5511912345678", "Carlos 11 91234-5678")).toBe(true);
    expect(telefoneEstaNoTexto("11912345679", "Carlos 11 91234-5678")).toBe(false);
  });

  it("confere o nome sem acento e sem caixa", () => {
    expect(nomeEstaNoTexto("João Pereira", "JOAO PEREIRA 11 98765-4321")).toBe(true);
    expect(nomeEstaNoTexto("João Pereira Lima", "JOAO PEREIRA 11 98765-4321")).toBe(false);
  });

  it("ignora resposta sem a forma esperada", () => {
    expect(conferirLeituraDaIa(null, "x")).toEqual([]);
    expect(conferirLeituraDaIa({ leads: [42, { nome: "A" }] }, "x")).toEqual([]);
  });

  it("corta a lista em linha em branco, sem separar uma ficha", () => {
    const ficha = (n: number) => `Nome: Cliente ${n}\nTelefone: 11 9${String(n).padStart(4, "0")}-0000`;
    const texto = Array.from({ length: 80 }, (_, i) => ficha(i)).join("\n\n");
    const pedacos = dividirEmPedacos(texto, 500);
    expect(pedacos.length).toBeGreaterThan(1);
    for (const p of pedacos) {
      expect(p.split("\n\n").every((f) => /^Nome: .*\nTelefone: /.test(f))).toBe(true);
    }
    expect(pedacos.join("\n\n")).toBe(texto);
  });
});
