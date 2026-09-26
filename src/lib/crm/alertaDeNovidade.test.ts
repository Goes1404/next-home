import { describe, expect, it } from "vitest";
import { descreverPedido, imovelParaAvisar, lerAlerta, type ImovelNovo } from "./alertaDeNovidade";
import { parseFavoritos, parseInteresse } from "./pedidoDoSite";

const imovel = (id: string, p: Partial<ImovelNovo> = {}): ImovelNovo => ({
  id,
  nome: id,
  slug: id,
  cidade: "Barueri",
  bairro: "Alphaville",
  precoAPartir: 600_000,
  dormitorios: [2, 3],
  ...p,
});

describe("me avise quando surgir", () => {
  const pedido = { regiao_interesse: "Alphaville", dormitorios_min: 3, orcamento_max: 700_000 };

  it("escolhe o imóvel novo que combina", () => {
    const novos = [imovel("caro", { precoAPartir: 1_500_000 }), imovel("certo")];
    expect(imovelParaAvisar(pedido, novos, [])?.id).toBe("certo");
  });

  it("não avisa o mesmo imóvel duas vezes", () => {
    expect(imovelParaAvisar(pedido, [imovel("certo")], ["certo"])).toBeNull();
  });

  it("pedido sem critério nenhum não recebe aviso de tudo", () => {
    expect(imovelParaAvisar({ regiao_interesse: null, dormitorios_min: null, orcamento_max: null }, [imovel("a")], [])).toBeNull();
  });

  it("lê o pedido gravado pelo formulário", () => {
    expect(lerAlerta({ alerta: true, avisados: ["x", 3] })).toEqual({ ativo: true, avisados: ["x"] });
    expect(lerAlerta({ favoritos: ["a"] }).ativo).toBe(false);
    expect(lerAlerta(null).ativo).toBe(false);
  });

  it("descreve o pedido em palavras", () => {
    expect(descreverPedido(pedido)).toBe("3+ dormitórios, em Alphaville, até R$ 700 mil");
  });
});

describe("o que o formulário público aceita", () => {
  it("critérios fora da faixa viram nulo", () => {
    expect(parseInteresse({ regiao: " Barueri ", dormitoriosMin: 99, precoMax: -1 })).toEqual({
      regiao_interesse: "Barueri",
      dormitorios_min: null,
      orcamento_max: null,
    });
  });
  it("favoritos só com cara de slug, sem repetir", () => {
    expect(parseFavoritos(["vista-alta", "vista-alta", "<script>", 3])).toEqual(["vista-alta"]);
  });
});
