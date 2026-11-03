import { describe, expect, it } from "vitest";
import {
  botoesDoBanco,
  componentesDoEnvio,
  estadoDaMeta,
  nomeParaMeta,
  PAYLOAD_INTERESSE,
  PAYLOAD_PARAR,
  pedidoDeCriacao,
  problemasDoModelo,
  renderizarModelo,
  variaveisDoCorpo,
  type DefinicaoDoModelo,
} from "./modelos";

const BOM: DefinicaoDoModelo = {
  nome: "lancamento_dom_parque",
  idioma: "pt_BR",
  categoria: "MARKETING",
  corpo: "Oi {{nome}}! Saiu a tabela do {{imovel}} com condição de lançamento. Quer que eu te mande os detalhes?",
  exemplos: { nome: "Carla", imovel: "Dom Parque" },
  cabecalho: "imagem",
  rodape: "Next Home Imóveis",
  botoes: [
    { tipo: "interesse", texto: "Quero saber mais" },
    { tipo: "parar", texto: "Parar de receber" },
  ],
};

describe("modelos da API oficial", () => {
  it("lê as variáveis na ordem, sem repetir", () => {
    expect(variaveisDoCorpo("Oi {{nome}}, o {{imovel}} é para você, {{ nome }}.")).toEqual(["nome", "imovel"]);
  });

  it("transforma o título num nome que a Meta aceita", () => {
    expect(nomeParaMeta("Lançamento Dom Parque — 2 dorms!")).toBe("lancamento_dom_parque_2_dorms");
    expect(nomeParaMeta("   ")).toBe("modelo");
  });

  it("um modelo bom não tem problema", () => {
    expect(problemasDoModelo(BOM)).toEqual([]);
  });

  it("reprova o que a Meta reprovaria", () => {
    const ruim: DefinicaoDoModelo = {
      ...BOM,
      nome: "Lançamento",
      corpo: "{{nome}} {{imovel}}",
      exemplos: {},
      botoes: [{ tipo: "interesse", texto: "Um botão com texto comprido demais" }],
    };
    const problemas = problemasDoModelo(ruim).join(" | ");
    expect(problemas).toMatch(/nome do modelo/);
    expect(problemas).toMatch(/começar nem terminar/);
    expect(problemas).toMatch(/Duas variáveis seguidas/);
    expect(problemas).toMatch(/exemplo para \{\{nome\}\}/);
    expect(problemas).toMatch(/25 caracteres/);
    expect(problemas).toMatch(/Parar de receber/);
  });

  it("variável que não existe é recusada", () => {
    expect(problemasDoModelo({ ...BOM, corpo: "Oi, veja o {{preco}} do lançamento hoje mesmo." }).join(" ")).toMatch(
      /\{\{preco\}\}/,
    );
  });

  it("monta o pedido de criação no formato nomeado, com exemplo e botões", () => {
    const pedido = pedidoDeCriacao(BOM, "HANDLE123") as {
      name: string;
      category: string;
      parameter_format: string;
      components: Record<string, unknown>[];
    };
    expect(pedido.name).toBe("lancamento_dom_parque");
    expect(pedido.category).toBe("marketing");
    expect(pedido.parameter_format).toBe("named");
    expect(pedido.components[0]).toEqual({ type: "header", format: "image", example: { header_handle: ["HANDLE123"] } });
    expect(pedido.components[1]).toMatchObject({
      type: "body",
      example: {
        body_text_named_params: [
          { param_name: "nome", example: "Carla" },
          { param_name: "imovel", example: "Dom Parque" },
        ],
      },
    });
    expect(pedido.components[3]).toEqual({
      type: "buttons",
      buttons: [
        { type: "quick_reply", text: "Quero saber mais" },
        { type: "quick_reply", text: "Parar de receber" },
      ],
    });
  });

  it("o envio cita cada variável pelo nome, põe a foto e marca os botões", () => {
    const componentes = componentesDoEnvio(BOM, { nome: "Carla", imovel: "Dom Parque" }, "https://exemplo.com/foto.jpg");
    expect(componentes[0]).toEqual({
      type: "header",
      parameters: [{ type: "image", image: { link: "https://exemplo.com/foto.jpg" } }],
    });
    expect(componentes[1]).toEqual({
      type: "body",
      parameters: [
        { type: "text", parameter_name: "nome", text: "Carla" },
        { type: "text", parameter_name: "imovel", text: "Dom Parque" },
      ],
    });
    expect(componentes.slice(2)).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: PAYLOAD_INTERESSE }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: PAYLOAD_PARAR }] },
    ]);
  });

  it("variável sem valor sai com um substituto, nunca vazia (a Meta recusaria)", () => {
    const [, corpo] = componentesDoEnvio(BOM, { nome: "  ", imovel: null }, "https://x/y.jpg") as {
      parameters: { text: string }[];
    }[];
    expect(corpo.parameters.map((p) => p.text)).toEqual(["tudo bem", "nosso lançamento"]);
    expect(renderizarModelo("Oi {{nome}}, veja o {{imovel}}.", {})).toBe("Oi tudo bem, veja o nosso lançamento.");
  });

  it("traduz o estado da Meta", () => {
    expect(estadoDaMeta("APPROVED")).toBe("aprovado");
    expect(estadoDaMeta("REJECTED")).toBe("rejeitado");
    expect(estadoDaMeta("PAUSED")).toBe("pausado");
    expect(estadoDaMeta("DISABLED")).toBe("desativado");
    expect(estadoDaMeta("PENDING")).toBe("em_analise");
    expect(estadoDaMeta("algo novo")).toBeNull();
  });

  it("lê os botões do banco sem confiar no formato", () => {
    expect(botoesDoBanco([{ tipo: "parar", texto: "Parar" }, { tipo: "x", texto: "Sim" }, { texto: "" }, 3, null])).toEqual([
      { tipo: "parar", texto: "Parar" },
      { tipo: "interesse", texto: "Sim" },
    ]);
    expect(botoesDoBanco("lixo")).toEqual([]);
  });
});
