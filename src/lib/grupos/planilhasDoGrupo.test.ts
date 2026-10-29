import { describe, expect, it } from "vitest";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import { planilhasDoGrupo, type DadosDoGrupo } from "./planilhasDoGrupo";

const DADOS: DadosDoGrupo = {
  leads: [
    {
      id: "l1",
      nome: "Ana Prado",
      telefone: "5511988887777",
      email: "ana@exemplo.com",
      etapa: "em_conversa",
      origem: "site/form",
      empreendimento_id: "e1",
      imovel_interesse_id: null,
      orcamento_min: "300000",
      orcamento_max: null,
      renda_mensal: 8000,
      regiao_interesse: "Barueri",
      dormitorios_min: 2,
      created_at: "2026-10-01T15:00:00Z",
      visita_agendada_em: null,
      arquivado_em: null,
      corretor_id: "c1",
    },
  ],
  imoveis: [
    {
      id: "e1",
      nome: "Vista Parque",
      slug: "vista-parque",
      status: "em_construcao",
      cidade: "Barueri",
      bairro: "Centro",
      endereco: "Rua A, 10",
      construtora: "RSF",
      preco_a_partir: "349900",
      entrega_prevista: "2027-06-01",
      publicado: true,
      created_at: "2026-09-01T12:00:00Z",
    },
  ],
  corretores: [
    {
      id: "c1",
      nome: "Bruna",
      creci: "123456-F",
      papel: "corretor",
      ativo: true,
      created_at: "2026-08-01T12:00:00Z",
    },
  ],
  vendas: [
    {
      data_venda: "2026-10-10",
      lead_id: "l1",
      corretor_id: "c1",
      empreendimento_id: "e1",
      imovel_descricao: "Vista Parque",
      unidade: "Apto 12",
      valor_venda: "500000",
      comissao_percentual: 5,
      comissao_valor: "25000",
      status: "ativa",
      id: "v1",
      ultimo_recebimento: null,
    },
  ],
};

describe("planilhasDoGrupo", () => {
  it("monta as quatro abas, na ordem", () => {
    expect(planilhasDoGrupo(DADOS).map((p) => p.aba)).toEqual(["Leads", "Imóveis", "Corretores", "Vendas"]);
  });

  it("a aba de leads traz a ficha, o imóvel pelo nome e o corretor pelo nome", () => {
    const [leads] = planilhasDoGrupo(DADOS);
    const titulos = leads.colunas.map((c) => c.titulo);
    const linha = leads.linhas[0];
    expect(linha[titulos.indexOf("Nome")]).toBe("Ana Prado");
    expect(linha[titulos.indexOf("Imóvel de interesse")]).toBe("Vista Parque");
    expect(linha[titulos.indexOf("Corretor")]).toBe("Bruna");
    expect(linha[titulos.indexOf("Orçamento a partir de")]).toBe(300000);
  });

  it("corretores saem sem WhatsApp, e-mail nem login", () => {
    const corretores = planilhasDoGrupo(DADOS)[2];
    const titulos = corretores.colunas.map((c) => c.titulo.toLowerCase()).join(" ");
    expect(titulos).not.toMatch(/whatsapp|telefone|e-mail|email|login/);
    expect(corretores.linhas[0]).toContain("Bruna");
    expect(corretores.linhas[0]).toContain("123456-F");
  });

  it("vendas ligam o cliente e o corretor pelo nome, sem CPF nem observação", () => {
    const vendas = planilhasDoGrupo(DADOS)[3];
    const titulos = vendas.colunas.map((c) => c.titulo);
    expect(titulos.join(" ").toLowerCase()).not.toMatch(/cpf|cnpj|documento|observa/);
    const linha = vendas.linhas[0];
    expect(linha[titulos.indexOf("Cliente")]).toBe("Ana Prado");
    expect(linha[titulos.indexOf("Corretor")]).toBe("Bruna");
    expect(linha[titulos.indexOf("Valor")]).toBe(500000);
  });

  it("lead e corretor que não estão na exportação ficam em branco, sem quebrar", () => {
    const vendas = planilhasDoGrupo({ ...DADOS, leads: [], corretores: [] })[3];
    const titulos = vendas.colunas.map((c) => c.titulo);
    expect(vendas.linhas[0][titulos.indexOf("Cliente")]).toBeNull();
    expect(vendas.linhas[0][titulos.indexOf("Corretor")]).toBeNull();
  });

  it("vira um .xlsx de verdade", () => {
    const arquivo = gerarXlsx(planilhasDoGrupo(DADOS));
    expect(arquivo.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
