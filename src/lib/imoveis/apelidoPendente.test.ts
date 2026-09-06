import { describe, expect, it } from "vitest";
import {
  apelidosPendentes,
  contarPendencias,
  motivoDeUrgencia,
  type ImovelParaCuradoria,
} from "./apelidoPendente";

/*
 * Os 23 cadastros publicados SEM apelido em 31/08/2026, com os nomes como
 * estão no banco. A heurística foi calibrada contra estes — teste com nome
 * inventado provaria só que a regex casa com o que eu escrevi.
 */
const TITULOS_DE_ANUNCIO = [
  "3 Dormitórios com Suite e 2 Vagas",
  "Apartamento 1 ou 2 Dorms 39 M2",
  "Apartamento 2 Dorms a venda no Green Valley - Alphaville",
  "Apartamento ao lado do Shopping",
  "Melhor valor de metro da Região",
  "Minha Casa Minha Vida Analise de Crédito Gratuita",
  "More em Frente ao Colégio Mackenzie",
  "Royal Barueri - Shopping Barueri - Apartamento 1 a 3 Dorms",
  "Torre Única e Lazer na Cobertura",
];

const NOMES_DE_VERDADE = [
  "Ápice Park",
  "Bosque AlphaGran",
  "Breeze Home Clube",
  "Edifício Belline",
  "Elos Barueri",
  "Estação 267",
  "Eternity Alphaville Tamboré",
  "More Aldeia de Bareuri",
  "On The Park Alphaville",
  "Terra Alta",
  "Vila Eco Park",
  "Vista AlphaGran",
  "Vitra Alphaville",
  "Viva RSF Vila do Conde",
];

describe("motivoDeUrgencia — o nome identifica ou é anúncio?", () => {
  it.each(TITULOS_DE_ANUNCIO)("reconhece anúncio: %s", (nome) => {
    expect(motivoDeUrgencia(nome)).not.toBeNull();
  });

  it.each(NOMES_DE_VERDADE)("não acusa nome de verdade: %s", (nome) => {
    expect(motivoDeUrgencia(nome)).toBeNull();
  });

  it("aponta o motivo certo, para a tela poder explicar", () => {
    expect(motivoDeUrgencia("3 Dormitórios com Suite e 2 Vagas")).toBe("tipologia");
    expect(motivoDeUrgencia("Melhor valor de metro da Região")).toBe("oferta");
    expect(motivoDeUrgencia("Apartamento ao lado do Shopping")).toBe("substantivo_generico");
    expect(motivoDeUrgencia("More em Frente ao Colégio Mackenzie")).toBe("referencia_de_lugar");
  });

  /*
   * "Estação 267" é o caso que quase quebra a regra de tipologia: tem
   * número, mas o número não vem seguido de dormitório nem de m² — é parte
   * do nome. Sem o `\b<unidade>\b` obrigatório, ele viraria falso positivo.
   */
  it("número no nome não é tipologia por si só", () => {
    expect(motivoDeUrgencia("Estação 267")).toBeNull();
  });

  it("ignora acento e caixa", () => {
    expect(motivoDeUrgencia("ANÁLISE DE CRÉDITO gratuita")).toBe("oferta");
    expect(motivoDeUrgencia("3 dormitorios")).toBe("tipologia");
  });
});

describe("apelidosPendentes", () => {
  const imovel = (nome: string, apelidos: string[] = []): ImovelParaCuradoria => ({
    slug: nome.toLowerCase().replace(/\s+/g, "-"),
    nome,
    nomesAlternativos: apelidos,
  });

  it("deixa de fora quem já tem apelido", () => {
    const lista = apelidosPendentes([
      imovel("Vitra Alphaville", ["Vitra"]),
      imovel("Terra Alta"),
    ]);
    expect(lista.map((p) => p.imovel.nome)).toEqual(["Terra Alta"]);
  });

  it("põe os títulos de anúncio na frente", () => {
    const lista = apelidosPendentes([
      imovel("Terra Alta"),
      imovel("Ápice Park"),
      imovel("Melhor valor de metro da Região"),
    ]);
    expect(lista[0].imovel.nome).toBe("Melhor valor de metro da Região");
  });

  it("dentro de cada grupo, ordem alfabética — previsível para percorrer", () => {
    const lista = apelidosPendentes([
      imovel("Vitra Alphaville"),
      imovel("Ápice Park"),
      imovel("Terra Alta"),
    ]);
    expect(lista.map((p) => p.imovel.nome)).toEqual([
      "Ápice Park",
      "Terra Alta",
      "Vitra Alphaville",
    ]);
  });

  it("conta o total e os urgentes — o número que a tela mostra", () => {
    const todos = [...TITULOS_DE_ANUNCIO, ...NOMES_DE_VERDADE].map((n) => imovel(n));
    const contagem = contarPendencias(apelidosPendentes(todos));

    // Os 23 reais de produção: 9 anúncios e 14 nomes.
    expect(contagem).toEqual({ total: 23, urgentes: 9 });
  });

  it("lista vazia não vira contador fantasma", () => {
    expect(contarPendencias(apelidosPendentes([]))).toEqual({ total: 0, urgentes: 0 });
  });
});
