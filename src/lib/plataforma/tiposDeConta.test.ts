import { describe, expect, it } from "vitest";
import {
  mensalidadeDoPlano,
  slugSugerido,
  validarImobiliaria,
  validarIndependente,
  type FormularioDaImobiliaria,
  type FormularioDoIndependente,
} from "./tiposDeConta";

const IMOBILIARIA: FormularioDaImobiliaria = {
  nomeFantasia: "Imobiliária Silva",
  slug: "imobiliaria-silva",
  razaoSocial: "Silva Negócios Imobiliários Ltda",
  cnpj: "11.222.333/0001-81",
  creciJ: "12345-J",
  usuarios: "4",
  mensalidade: "",
  diaDoVencimento: "10",
  contatoNome: "",
  contatoEmail: "",
  contatoTelefone: "",
  gestorNome: "Ana Silva",
  gestorEmail: " Ana@Silva.com.br ",
  gestorWhatsapp: "(11) 98765-4321",
};

const INDEPENDENTE: FormularioDoIndependente = {
  nome: "Beto Corretor",
  slug: "beto-corretor",
  cpf: "529.982.247-25",
  creciF: "98765-F",
  email: "beto@gmail.com",
  whatsapp: "(11) 91234-5678",
  plano: "essencial",
  mensalidade: "",
  diaDoVencimento: "5",
};

describe("mensalidade por plano", () => {
  it("independente tem preço fixo; imobiliária cobra por usuário", () => {
    expect(mensalidadeDoPlano("essencial")).toBe(97);
    expect(mensalidadeDoPlano("profissional")).toBe(147);
    expect(mensalidadeDoPlano("imobiliaria", 1)).toBe(127);
    expect(mensalidadeDoPlano("imobiliaria", 4)).toBe(508);
    expect(mensalidadeDoPlano("custo")).toBe(0);
  });
});

describe("slug sugerido", () => {
  it("vem do nome, sem acento nem espaço", () => {
    expect(slugSugerido("João da Silva")).toBe("joao-da-silva");
  });
});

describe("imobiliária", () => {
  it("grava só dígitos do CNPJ, CRECI-J, plano imobiliária e mensalidade 127 x usuários", () => {
    const r = validarImobiliaria(IMOBILIARIA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.grupo).toMatchObject({ tipo: "imobiliaria", plano: "imobiliaria", nome: "Imobiliária Silva" });
    expect(r.dados.grupo.primeiro.email).toBe("ana@silva.com.br");
    expect(r.dados.cadastro).toEqual({
      razao_social: "Silva Negócios Imobiliários Ltda",
      documento: "11222333000181",
      creci: "12345-J",
      creci_tipo: "J",
      mensalidade: 508,
      dia_do_vencimento: 10,
    });
    // Sem contato de cobrança digitado, a cobrança vai para o gestor.
    expect(r.dados.grupo.contato.email).toBe("ana@silva.com.br");
  });

  it("mensalidade digitada vence a calculada", () => {
    const r = validarImobiliaria({ ...IMOBILIARIA, mensalidade: "450,50" });
    expect(r.ok && r.dados.cadastro.mensalidade).toBe(450.5);
  });

  it("recusa CNPJ inválido, razão social vazia, usuários e vencimento fora da regra", () => {
    expect(validarImobiliaria({ ...IMOBILIARIA, cnpj: "11.222.333/0001-82" })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("CNPJ"),
    });
    expect(validarImobiliaria({ ...IMOBILIARIA, razaoSocial: " " }).ok).toBe(false);
    expect(validarImobiliaria({ ...IMOBILIARIA, creciJ: "" }).ok).toBe(false);
    expect(validarImobiliaria({ ...IMOBILIARIA, usuarios: "0" }).ok).toBe(false);
    expect(validarImobiliaria({ ...IMOBILIARIA, usuarios: "abc" }).ok).toBe(false);
    expect(validarImobiliaria({ ...IMOBILIARIA, diaDoVencimento: "31" }).ok).toBe(false);
    expect(validarImobiliaria({ ...IMOBILIARIA, gestorEmail: "sem-arroba" }).ok).toBe(false);
  });
});

describe("corretor independente", () => {
  it("uma pessoa: é o gestor e o contato de cobrança, CPF só dígitos, CRECI-F, sem razão social", () => {
    const r = validarIndependente(INDEPENDENTE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { grupo, cadastro } = r.dados;
    expect(grupo).toMatchObject({ tipo: "independente", plano: "essencial", nome: "Beto Corretor" });
    expect(grupo.primeiro).toEqual({
      nome: "Beto Corretor",
      creci: "98765-F",
      whatsapp: "5511912345678",
      email: "beto@gmail.com",
    });
    expect(grupo.contato).toEqual({ nome: "Beto Corretor", email: "beto@gmail.com", telefone: "5511912345678" });
    expect(cadastro).toEqual({
      razao_social: null,
      documento: "52998224725",
      creci: "98765-F",
      creci_tipo: "F",
      mensalidade: 97,
      dia_do_vencimento: 5,
    });
  });

  it("profissional preenche 147 e a mensalidade digitada vence", () => {
    const a = validarIndependente({ ...INDEPENDENTE, plano: "profissional" });
    expect(a.ok && a.dados.cadastro.mensalidade).toBe(147);
    const b = validarIndependente({ ...INDEPENDENTE, mensalidade: "120" });
    expect(b.ok && b.dados.cadastro.mensalidade).toBe(120);
  });

  it("recusa CPF inválido, plano de imobiliária e CRECI vazio", () => {
    expect(validarIndependente({ ...INDEPENDENTE, cpf: "111.111.111-11" })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("CPF"),
    });
    expect(validarIndependente({ ...INDEPENDENTE, plano: "imobiliaria" }).ok).toBe(false);
    expect(validarIndependente({ ...INDEPENDENTE, plano: "custo" }).ok).toBe(false);
    expect(validarIndependente({ ...INDEPENDENTE, creciF: "" }).ok).toBe(false);
  });
});
