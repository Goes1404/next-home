import { describe, expect, it } from "vitest";
import {
  contarPorTipo,
  pendenciasDoCatalogo,
  type ImovelDoCatalogo,
} from "./pendenciasDoCatalogo";

const completo = (nome: string, extra: Partial<ImovelDoCatalogo> = {}): ImovelDoCatalogo => ({
  slug: nome.toLowerCase().replace(/\s+/g, "-"),
  nome,
  nomesAlternativos: ["apelido"],
  plantas: [{ id: "p" }],
  tipologias: [{ id: "t" }],
  ...extra,
});

describe("pendenciasDoCatalogo", () => {
  it("imóvel completo não entra na lista", () => {
    expect(pendenciasDoCatalogo([completo("Vitra Alphaville")])).toEqual([]);
  });

  it("aponta cada buraco com a explicação do custo", () => {
    const [item] = pendenciasDoCatalogo([
      completo("Terra Alta", { plantas: [], tipologias: [] }),
    ]);
    expect(item.pendencias.map((p) => p.tipo)).toEqual(["sem_planta", "sem_tipologia"]);
    expect(item.pendencias[0].explicacao).toContain("pede a planta");
  });

  /*
   * A distinção que faz a lista valer: um cadastro chamado "Melhor valor de
   * metro da Região" sem apelido não é "seria bom ter" — é um imóvel que o
   * bot não tem como reconhecer, porque não existe nome para o cliente
   * acertar.
   */
  it("só cobra apelido de nome que é anúncio; nome de verdade não entra na lista", () => {
    // 02/10/2026: "Beyond Residence" sem apelido não é pendência — a
    // assistente reconhece o nome e a palavra marcante dele.
    const lista = pendenciasDoCatalogo([
      completo("Vitra Alphaville", { nomesAlternativos: [] }),
      completo("Melhor valor de metro da Região", { nomesAlternativos: [] }),
    ]);

    expect(lista).toHaveLength(1);
    expect(lista[0].imovel.nome).toBe("Melhor valor de metro da Região");
    expect(lista[0].pendencias[0].tipo).toBe("apelido_invisivel");
  });

  it("ordena pelo estrago: invisível, depois planta, depois tipologia", () => {
    const lista = pendenciasDoCatalogo([
      completo("Sem Tipologia", { tipologias: [] }),
      completo("Sem Planta", { plantas: [] }),
      completo("3 Dormitórios com Suite e 2 Vagas", { nomesAlternativos: [] }),
    ]);

    expect(lista.map((x) => x.imovel.nome)).toEqual([
      "3 Dormitórios com Suite e 2 Vagas",
      "Sem Planta",
      "Sem Tipologia",
    ]);
  });

  it("dentro do mesmo peso, ordem alfabética — previsível para percorrer", () => {
    const lista = pendenciasDoCatalogo([
      completo("Zeta", { plantas: [] }),
      completo("Alfa", { plantas: [] }),
    ]);
    expect(lista.map((x) => x.imovel.nome)).toEqual(["Alfa", "Zeta"]);
  });

  it("conta por tipo, contando um imóvel em cada buraco que ele tem", () => {
    const contagem = contarPorTipo(
      pendenciasDoCatalogo([
        completo("A", { plantas: [], tipologias: [] }),
        completo("B", { plantas: [] }),
      ]),
    );
    expect(contagem.sem_planta).toBe(2);
    expect(contagem.sem_tipologia).toBe(1);
    expect(contagem.apelido_invisivel).toBe(0);
  });

  it("catálogo vazio não vira lista fantasma", () => {
    expect(pendenciasDoCatalogo([])).toEqual([]);
  });
});
