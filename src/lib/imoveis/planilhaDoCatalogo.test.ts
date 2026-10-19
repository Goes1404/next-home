import { describe, expect, it } from "vitest";
import { lerPlanilhaXlsx } from "@/lib/leads/xlsxLeitura";
import type { Empreendimento, Tipologia } from "@/lib/types";
import {
  COLUNAS_DO_CATALOGO,
  contarLeadsPorImovel,
  descreverPlanta,
  faixaDeMetragens,
  planilhaDoCatalogo,
} from "./planilhaDoCatalogo";
import { gerarXlsx, letraDaColuna } from "./xlsxEscrita";

function planta(p: Partial<Tipologia>): Tipologia {
  return {
    nome: "",
    areaPrivativa: null,
    dormitorios: 0,
    suites: 0,
    banheiros: 0,
    vagas: 0,
    preco: null,
    plantaUrl: null,
    unidadesDisponiveis: null,
    ...p,
  };
}

function imovel(p: Partial<Empreendimento>): Empreendimento {
  return {
    id: "a",
    slug: "a",
    nome: "Dom Parque",
    tagline: "",
    descricao: "Perto do parque & da estação <novo>.",
    status: "em_construcao",
    tipo: "apartamento",
    finalidade: "venda",
    cidade: "Barueri",
    bairro: "Aldeia",
    endereco: "Rua X, 10",
    precoAPartir: 349900,
    iptu: null,
    condominioValor: null,
    construtora: "P4",
    totalUnidades: null,
    totalTorres: null,
    totalAndares: null,
    entregaPrevista: "2027-10-01",
    destaque: false,
    publicado: true,
    lat: -23.5,
    lng: -46.8,
    criadoEm: "2026-01-01",
    capa: { tipo: "foto", url: "", alt: "", largura: 1, altura: 1 } as Empreendimento["capa"],
    galeria: [],
    plantas: [],
    videos: [],
    tours360: [],
    tipologias: [
      planta({ areaPrivativa: 78, dormitorios: 3, suites: 1, banheiros: 2, vagas: 1 }),
      planta({ areaPrivativa: 55.5, dormitorios: 2 }),
    ],
    lazer: [],
    ...p,
  };
}

describe("planilha do catálogo", () => {
  it("zero em banheiro e vaga é ausência", () => {
    expect(descreverPlanta(planta({ areaPrivativa: 55, dormitorios: 2 }))).toBe("55 m² · 2 dorm");
    expect(descreverPlanta(planta({ dormitorios: 1 }))).toBe("área não informada · 1 dorm");
  });

  it("faixa de metragens", () => {
    expect(faixaDeMetragens(imovel({}).tipologias)).toBe("55,5 a 78 m²");
    expect(faixaDeMetragens([])).toBeNull();
  });

  it("lead conta uma vez, pelo interesse antes do cadastro", () => {
    const m = contarLeadsPorImovel([
      { empreendimento_id: "a", imovel_interesse_id: "b" },
      { empreendimento_id: "a", imovel_interesse_id: null },
      { empreendimento_id: null, imovel_interesse_id: null },
    ]);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(1);
  });

  it("letras de coluna", () => {
    expect([0, 25, 26, 27].map(letraDaColuna)).toEqual(["A", "Z", "AA", "AB"]);
  });

  it("o .xlsx gerado volta inteiro pelo leitor da casa", () => {
    const xlsx = gerarXlsx(
      planilhaDoCatalogo([imovel({}), imovel({ id: "z", nome: "Rascunho X", publicado: false, precoAPartir: null })], new Map([["a", 7]])),
    );
    const leitura = lerPlanilhaXlsx(xlsx);
    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    const [aba] = leitura.abas;
    expect(aba.nome).toBe("Catálogo");
    expect(aba.linhas[0]).toEqual(COLUNAS_DO_CATALOGO.map((c) => c.titulo));
    const linha = aba.linhas[1];
    const col = (t: string) => linha[COLUNAS_DO_CATALOGO.findIndex((c) => c.titulo === t)];
    expect(col("Nome")).toBe("Dom Parque");
    expect(col("Prazo de entrega")).toBe("outubro de 2027");
    expect(col("Valor a partir de (R$)")).toBe("349900");
    expect(col("Leads")).toBe("7");
    expect(col("Descrição")).toBe("Perto do parque & da estação <novo>.");
    expect(col("Plantas")).toBe("55,5 m² · 2 dorm\n78 m² · 3 dorm · 1 suíte · 2 banh · 1 vaga");
    expect(aba.linhas[2][1]).toBe("Rascunho");
    expect(aba.linhas[2][COLUNAS_DO_CATALOGO.findIndex((c) => c.titulo === "Leads")]).toBe("0");
  });
});
