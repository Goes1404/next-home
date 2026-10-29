import { describe, expect, it } from "vitest";
import {
  errosDoPasso,
  errosDoTesteGratis,
  formularioDaImobiliariaDoPedido,
  formularioDoIndependenteDoPedido,
  hrefDeContratar,
  hrefDeCriarConta,
  lerPlanoDaUrl,
  limitarUsuarios,
  mascararParaLog,
  mascararWhatsapp,
  mensagemDoPedidoParaAstro,
  PLANO_CONTRATAVEL,
  resumoDoPlano,
  totalMensal,
  validarPedido,
  whatsappValido,
  type DadosDoPedido,
} from "./pedidoDeContratacao";
import { PRECO_ESSENCIAL, PRECO_POR_USUARIO_DA_IMOBILIARIA, PRECO_PROFISSIONAL, USUARIOS_MAXIMO } from "./tiposDeConta";

/**
 * O pedido de contratação da página de vendas (29/10/2026): as regras que o
 * assistente (navegador) e a action (servidor) aplicam juntas, e o
 * pré-preenchimento dos formulários da plataforma.
 */

/** O `toLocaleString` do real separa "R$" do número com espaço inquebrável. */
const sp = (t: string) => t.replace(/\s/g, " ");

const BOM: DadosDoPedido = {
  plano: "imobiliaria",
  usuarios: 5,
  nome: "  Ana   Paula Souza ",
  whatsapp: "(11) 98765-4321",
  email: " Ana@Imob.com.br ",
  imobiliaria: "Imob Sol",
  creci: "",
  cidade: "Barueri",
  uf: "sp",
};

describe("preço e plano", () => {
  it("os preços são os da plataforma (tiposDeConta)", () => {
    expect(PLANO_CONTRATAVEL.essencial.preco).toBe(PRECO_ESSENCIAL);
    expect(PLANO_CONTRATAVEL.profissional.preco).toBe(PRECO_PROFISSIONAL);
    expect(PLANO_CONTRATAVEL.imobiliaria.preco).toBe(PRECO_POR_USUARIO_DA_IMOBILIARIA);
  });

  it("total: preço fixo no autônomo (usuários não contam), por usuário na imobiliária", () => {
    expect(totalMensal("essencial", 9)).toBe(PRECO_ESSENCIAL);
    expect(totalMensal("profissional", 1)).toBe(PRECO_PROFISSIONAL);
    expect(totalMensal("imobiliaria", 5)).toBe(5 * PRECO_POR_USUARIO_DA_IMOBILIARIA);
    expect(totalMensal("imobiliaria", 0)).toBe(PRECO_POR_USUARIO_DA_IMOBILIARIA);
    expect(totalMensal("imobiliaria", 9999)).toBe(USUARIOS_MAXIMO * PRECO_POR_USUARIO_DA_IMOBILIARIA);
  });

  it("limita usuários de 1 ao teto, inteiro", () => {
    expect(limitarUsuarios(0)).toBe(1);
    expect(limitarUsuarios(3.7)).toBe(3);
    expect(limitarUsuarios(Number.NaN)).toBe(1);
    expect(limitarUsuarios(USUARIOS_MAXIMO + 1)).toBe(USUARIOS_MAXIMO);
  });

  it("?plano= da URL só aceita os três ids", () => {
    expect(lerPlanoDaUrl("essencial")).toBe("essencial");
    expect(lerPlanoDaUrl(["imobiliaria", "x"])).toBe("imobiliaria");
    expect(lerPlanoDaUrl("custo")).toBeNull();
    expect(lerPlanoDaUrl(undefined)).toBeNull();
    expect(hrefDeContratar("profissional")).toBe("/astro/contratar?plano=profissional");
  });

  it("resumo do plano no singular e no plural", () => {
    expect(sp(resumoDoPlano("imobiliaria", 1))).toBe("Imobiliária, 1 usuário (R$ 127 por mês)");
    expect(sp(resumoDoPlano("imobiliaria", 5))).toBe("Imobiliária, 5 usuários (R$ 635 por mês)");
    expect(sp(resumoDoPlano("essencial", 5))).toBe("Autônomo Essencial (R$ 97 por mês)");
  });
});

describe("WhatsApp", () => {
  it("máscara conforme digita, com ou sem o 55", () => {
    expect(mascararWhatsapp("11")).toBe("(11");
    expect(mascararWhatsapp("1198")).toBe("(11) 98");
    expect(mascararWhatsapp("1132345678")).toBe("(11) 3234-5678");
    expect(mascararWhatsapp("11987654321")).toBe("(11) 98765-4321");
    expect(mascararWhatsapp("5511987654321")).toBe("(11) 98765-4321");
    expect(mascararWhatsapp("11987654321999")).toBe("(11) 98765-4321");
    expect(mascararWhatsapp("")).toBe("");
  });

  it("válido: celular com 9, fixo de 10 dígitos, com ou sem 55", () => {
    expect(whatsappValido("(11) 98765-4321")).toBe("5511987654321");
    expect(whatsappValido("+55 11 98765-4321")).toBe("5511987654321");
    expect(whatsappValido("(11) 3234-5678")).toBe("551132345678");
  });

  it("inválido: curto, DDD com zero, celular sem o 9, número repetido", () => {
    expect(whatsappValido("98765-4321")).toBeNull();
    expect(whatsappValido("(01) 98765-4321")).toBeNull();
    expect(whatsappValido("(11) 88765-4321")).toBeNull();
    expect(whatsappValido("(11) 99999-9999")).toBeNull();
    expect(whatsappValido("+1 415 555 0100")).toBeNull();
  });

  it("o log nunca leva o número inteiro", () => {
    expect(mascararParaLog("5511987654321")).toBe("55119****4321");
    expect(mascararParaLog("5511987654321")).not.toContain("98765");
  });
});

describe("validarPedido", () => {
  it("limpa o pedido bom (espaços, e-mail minúsculo, UF maiúscula, CRECI vazio vira null)", () => {
    const r = validarPedido(BOM);
    expect(r).toEqual({
      ok: true,
      pedido: {
        plano: "imobiliaria",
        usuarios: 5,
        nome: "Ana Paula Souza",
        whatsapp: "5511987654321",
        email: "ana@imob.com.br",
        imobiliaria: "Imob Sol",
        creci: null,
        documento: null,
        cidade: "Barueri",
        uf: "SP",
      },
    });
  });

  it("CPF ou CNPJ opcional (0241): limpo para dígitos, e torto recusa", () => {
    const cpf = validarPedido({ ...BOM, documento: "529.982.247-25" });
    expect(cpf.ok && cpf.pedido.documento).toBe("52998224725");
    const cnpj = validarPedido({ ...BOM, documento: "11.444.777/0001-61" });
    expect(cnpj.ok && cnpj.pedido.documento).toBe("11444777000161");
    expect(validarPedido({ ...BOM, documento: "111.111.111-11" })).toMatchObject({ ok: false, erros: { documento: expect.any(String) } });
    expect(validarPedido({ ...BOM, documento: "123" })).toMatchObject({ ok: false, erros: { documento: expect.any(String) } });
  });

  it("o teste grátis pede o CRECI", () => {
    expect(errosDoTesteGratis({ creci: null })).toEqual({ creci: expect.stringContaining("CRECI") });
    expect(errosDoTesteGratis({ creci: "1-F" })).toEqual({});
  });

  it("autônomo: usuários viram 1 e o nome da imobiliária é ignorado", () => {
    const r = validarPedido({ ...BOM, plano: "essencial", usuarios: 40, imobiliaria: "" });
    expect(r.ok && r.pedido.usuarios).toBe(1);
    expect(r.ok && r.pedido.imobiliaria).toBeNull();
  });

  it("um erro por campo, com o plano da imobiliária pedindo o nome dela", () => {
    const r = validarPedido({ plano: "imobiliaria", usuarios: 0, nome: "Ana", whatsapp: "123", email: "x@", imobiliaria: "", cidade: "", uf: "XX" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.erros).sort()).toEqual(["cidade", "email", "imobiliaria", "nome", "uf", "usuarios", "whatsapp"]);
  });

  it("plano desconhecido ou do preço de custo é recusado", () => {
    expect(validarPedido({ ...BOM, plano: "custo" }).ok).toBe(false);
    expect(validarPedido({ ...BOM, plano: undefined }).ok).toBe(false);
  });

  it("recusa texto longo demais (o banco também recusaria)", () => {
    const r = validarPedido({ ...BOM, nome: `Ana ${"a".repeat(130)}`, creci: "1".repeat(31) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.nome).toBeTruthy();
    expect(r.erros.creci).toBeTruthy();
  });

  it("tipos estranhos do navegador não derrubam a validação", () => {
    const r = validarPedido({ ...BOM, nome: 42 as unknown as string, whatsapp: null as unknown as string });
    expect(r.ok).toBe(false);
  });

  it("errosDoPasso separa o que é de cada passo", () => {
    const d = { ...BOM, plano: "", nome: "" };
    expect(Object.keys(errosDoPasso(1, d))).toEqual(["plano"]);
    expect(Object.keys(errosDoPasso(2, d))).toEqual(["nome"]);
    expect(errosDoPasso(1, BOM)).toEqual({});
  });
});

describe("mensagem e pré-preenchimento", () => {
  const gravado = {
    id: "00000000-0000-4000-8000-000000000001",
    plano: "imobiliaria",
    usuarios: 4,
    nome: "Ana Paula Souza",
    whatsapp: "5511987654321",
    email: "ana@imob.com.br",
    imobiliaria: "Imob Sol",
    creci: "12345-J",
  };

  it("a mensagem para a Astro resume o pedido, sem e-mail nem telefone", () => {
    const m = sp(mensagemDoPedidoParaAstro({ plano: "imobiliaria", usuarios: 4, nome: "Ana Paula Souza", imobiliaria: "Imob Sol", cidade: "Barueri", uf: "SP" }));
    expect(m).toContain("Imobiliária, 4 usuários (R$ 508 por mês)");
    expect(m).toContain("Ana Paula Souza, da Imob Sol, de Barueri/SP");
    expect(m).not.toContain("@");
  });

  it("imobiliária: a pessoa é o contato e o primeiro gestor; mensalidade pelos usuários", () => {
    expect(formularioDaImobiliariaDoPedido(gravado)).toEqual({
      nomeFantasia: "Imob Sol",
      slug: "imob-sol",
      creciJ: "12345-J",
      usuarios: "4",
      mensalidade: "508,00",
      contatoNome: "Ana Paula Souza",
      contatoEmail: "ana@imob.com.br",
      contatoTelefone: "(11) 98765-4321",
      gestorNome: "Ana Paula Souza",
      gestorEmail: "ana@imob.com.br",
      gestorWhatsapp: "(11) 98765-4321",
    });
  });

  it("independente: plano e mensalidade do pedido", () => {
    expect(formularioDoIndependenteDoPedido({ ...gravado, plano: "profissional", imobiliaria: null, creci: null })).toEqual({
      nome: "Ana Paula Souza",
      slug: "ana-paula-souza",
      creciF: "",
      email: "ana@imob.com.br",
      whatsapp: "(11) 98765-4321",
      plano: "profissional",
      mensalidade: "147,00",
    });
  });

  it("criar conta abre o formulário do tipo certo, só com o id do pedido na URL", () => {
    expect(hrefDeCriarConta(gravado)).toBe(`/plataforma/grupos/novo/imobiliaria?pedido=${gravado.id}`);
    expect(hrefDeCriarConta({ ...gravado, plano: "essencial" })).toBe(`/plataforma/grupos/novo/independente?pedido=${gravado.id}`);
  });
});
