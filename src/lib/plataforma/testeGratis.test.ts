import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import type { PedidoLimpo } from "./pedidoDeContratacao";

/**
 * O teste grátis de 7 dias (29/10/2026, 0241) e o núcleo da criação de
 * conta (`criarConta.ts`) que ele divide com a plataforma.
 *
 * O que se prova: a conta nasce com `teste_ate`, sem a competência de valor
 * 0 do cadastro e com o pedido `convertido`; o link do convite nunca volta
 * para a tela pública; um teste por e-mail, WhatsApp e CPF/CNPJ; e-mail com
 * ficha recusa; sem e-mail configurado não há teste; falha no convite desfaz
 * o grupo e solta o pedido; e o núcleo só cria com a prova certa — o pedido
 * do teste relido (recente, `novo`, mesmo e-mail) ou a guarda da plataforma
 * de novo —, sem a guarda da plataforma ser chamada no caminho do teste.
 */

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };
let chamadasDaGuarda: number;
let emailLigado: boolean;
let respostaDoLink: { ok: boolean; url?: string; userId?: string; motivo?: string };
let respostaDoEnvio: { enviado: boolean; motivo?: string };
let avisos: { titulo: string; corpo: string; url: string }[];
let contatoDoGrupo: unknown;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/guardas", () => ({
  exigirAdminDaPlataformaNaAcao: async () => {
    chamadasDaGuarda++;
    return guarda;
  },
}));
vi.mock("@/lib/auth/links", () => ({ gerarLinkDeAcesso: async () => respostaDoLink }));
vi.mock("@/lib/auth/emailsDeAcesso", () => ({ enviarLinkDeAcesso: async () => respostaDoEnvio }));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  emailConfigurado: () => emailLigado,
}));
vi.mock("@/lib/notificacoes/avisosDaPlataforma", () => ({
  avisarAtendimento: (n: { titulo: string; corpo: string; url: string }) => avisos.push(n),
}));

const { iniciarTesteGratis, MENSAGEM_TESTE_INDISPONIVEL, MENSAGEM_TESTE_JA_USADO, MENSAGEM_DOCUMENTO_COM_CONTA } = await import(
  "./testeGratis"
);
const { criarContaComPrimeiroAcesso } = await import("./criarConta");
const { validarNovoGrupo } = await import("./dadosDoGrupo");

const AGORA = new Date("2026-10-29T15:00:00-03:00");
const URL_CONVITE = "https://site/auth/confirmar?token_hash=segredo&type=invite";

const PEDIDO: PedidoLimpo = {
  plano: "essencial",
  usuarios: 1,
  nome: "Ana Paula Souza",
  whatsapp: "5511987654321",
  email: "ana@exemplo.com.br",
  imobiliaria: null,
  creci: "123456-F",
  documento: "52998224725",
  cidade: "Barueri",
  uf: "SP",
};

/** O `criar_grupo` falso grava o que o real grava (0195) e o gatilho da 0207 (a competência de valor 0). */
function criarGrupoFalso(args: Record<string, unknown>) {
  if (banco.tabelas.grupos.some((g) => g.slug === args.p_slug)) {
    return { data: null, error: { message: "slug em uso", code: "23505" } };
  }
  const id = `grupo-${banco.tabelas.grupos.length + 1}`;
  contatoDoGrupo = args.p_contato;
  banco.tabelas.grupos.push({
    id,
    nome: args.p_nome,
    slug: args.p_slug,
    tipo: args.p_tipo,
    plano: args.p_plano,
    criado_por: args.p_criado_por,
    documento: null,
    contato_cobranca_telefone: null,
  });
  banco.tabelas.parametros_credito.push({ grupo_id: id });
  banco.tabelas.fiscal_config.push({ grupo_id: id });
  banco.tabelas.admin_eventos.push({ acao: "grupo_criado", grupo_id: id, ator_plataforma_user_id: args.p_criado_por });
  banco.tabelas.pagamentos_do_grupo.push({ grupo_id: id, competencia: "2026-10-01", valor: 0, asaas_pagamento_id: null });
  return { data: id, error: null };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
  chamadasDaGuarda = 0;
  emailLigado = true;
  respostaDoLink = { ok: true, url: URL_CONVITE, userId: "usuario-novo" };
  respostaDoEnvio = { enviado: true };
  avisos = [];
  banco = bancoFalso({
    grupos: [{ id: "g-nh", nome: "Next Home", slug: "next-home", documento: "11222333000181", contato_cobranca_telefone: null }],
    corretores: [{ id: "c-beto", nome: "Beto", slug: "beto", user_id: "u-beto", email: "Beto@Gmail.com", grupo_id: "g-nh" }],
    pedidos_de_contratacao: [],
    parametros_credito: [],
    fiscal_config: [],
    admin_eventos: [],
    pagamentos_do_grupo: [],
  });
  banco.cliente.rpc = async (nome: string, args: Record<string, unknown>) =>
    nome === "criar_grupo" ? criarGrupoFalso(args) : { data: null, error: { message: `rpc inesperado: ${nome}` } };
  // O insert do pedido devolve a linha com `criado_em`, como o banco.
  const from = banco.cliente.from;
  banco.cliente.from = (tabela: string) => {
    const q = from(tabela);
    if (tabela !== "pedidos_de_contratacao") return q;
    const insert = q.insert;
    return { ...q, insert: (v: Record<string, unknown>) => insert({ criado_em: new Date().toISOString(), status: "novo", grupo_criado_id: null, ...v }) } as never;
  };
});

const grupoNovo = () => banco.tabelas.grupos.find((g) => g.id !== "g-nh");

describe("iniciarTesteGratis", () => {
  it("cria a conta com o teste de 7 dias, apaga a competência do cadastro e converte o pedido", async () => {
    const r = await iniciarTesteGratis(PEDIDO, AGORA, AGORA);
    expect(r).toEqual({ ok: true, grupoId: "grupo-2", fimDoTeste: "2026-11-05", emailEnviado: true });
    // O link do convite nunca volta para a tela pública.
    expect(JSON.stringify(r)).not.toContain("token_hash");

    expect(grupoNovo()).toMatchObject({
      nome: "Ana Paula Souza",
      slug: "ana-paula-souza",
      tipo: "independente",
      plano: "essencial",
      criado_por: null,
      documento: "52998224725",
      creci: "123456-F",
      creci_tipo: "F",
      mensalidade: 97,
      dia_do_vencimento: 5,
      teste_ate: new Date("2026-11-05T15:00:00-03:00").toISOString(),
    });
    expect(banco.tabelas.pagamentos_do_grupo.filter((p) => p.grupo_id === "grupo-2")).toEqual([]);

    const ficha = banco.tabelas.corretores.find((c) => c.grupo_id === "grupo-2");
    expect(ficha).toMatchObject({ papel: "gestor", user_id: "usuario-novo", email: "ana@exemplo.com.br", whatsapp: "5511987654321" });

    expect(banco.tabelas.pedidos_de_contratacao).toEqual([
      expect.objectContaining({ teste_gratis: true, status: "convertido", grupo_criado_id: "grupo-2", documento: "52998224725" }),
    ]);
    const eventos = banco.tabelas.admin_eventos.filter((e) => e.grupo_id === "grupo-2");
    expect(eventos.map((e) => e.acao)).toEqual(["grupo_criado", "convite_enviado", "teste_gratis_iniciado"]);
    const pedidoId = banco.tabelas.pedidos_de_contratacao[0].id;
    expect(eventos[1]).toMatchObject({
      ator_id: null,
      ator_plataforma_user_id: null,
      detalhes: expect.objectContaining({ origem: "teste-gratis", pedido_id: pedidoId }),
    });
    expect(eventos[2]).toMatchObject({ detalhes: expect.objectContaining({ origem: "teste-gratis", pedido_id: pedidoId }) });
    expect(avisos).toEqual([expect.objectContaining({ titulo: "Teste grátis iniciado", corpo: "Teste grátis iniciado: Ana Paula Souza." })]);
    // O caminho do teste não usa (nem precisa) da guarda da plataforma.
    expect(chamadasDaGuarda).toBe(0);
  });

  it("imobiliária: o nome da conta é o da imobiliária, quem pediu é o contato, e a mensalidade conta os usuários", async () => {
    const r = await iniciarTesteGratis(
      { ...PEDIDO, plano: "imobiliaria", usuarios: 3, imobiliaria: "Imob Sol", documento: "11444777000161" },
      AGORA,
      AGORA,
    );
    expect(r.ok).toBe(true);
    expect(grupoNovo()).toMatchObject({
      nome: "Imob Sol",
      slug: "imob-sol",
      tipo: "imobiliaria",
      creci_tipo: "J",
      mensalidade: 381,
    });
    expect(contatoDoGrupo).toEqual({ nome: "Ana Paula Souza", email: "ana@exemplo.com.br", telefone: "5511987654321" });
  });

  it("e-mail que não saiu: a conta fica, a tela não recebe o link, e o aviso diz para reenviar", async () => {
    respostaDoEnvio = { enviado: false, motivo: "recusado" };
    const r = await iniciarTesteGratis(PEDIDO, AGORA, AGORA);
    expect(r).toMatchObject({ ok: true, emailEnviado: false });
    expect(JSON.stringify(r)).not.toContain("token_hash");
    expect(avisos[0].corpo).toContain("NÃO saiu");
  });

  it("sem envio de e-mail configurado não há teste, e nada é gravado", async () => {
    emailLigado = false;
    expect(await iniciarTesteGratis(PEDIDO, AGORA, AGORA)).toEqual({ ok: false, erro: MENSAGEM_TESTE_INDISPONIVEL });
    expect(banco.consultas).toHaveLength(0);
  });

  it("e-mail que já tem ficha (sem diferença de maiúsculas) recusa", async () => {
    const r = await iniciarTesteGratis({ ...PEDIDO, email: "beto@gmail.com" }, AGORA, AGORA);
    expect(r).toMatchObject({ ok: false, campo: "email" });
    expect(banco.tabelas.grupos).toHaveLength(1);
    expect(banco.tabelas.pedidos_de_contratacao).toHaveLength(0);
  });

  it("um teste por e-mail, por WhatsApp e por CPF/CNPJ", async () => {
    expect((await iniciarTesteGratis(PEDIDO, AGORA, AGORA)).ok).toBe(true);
    const outro = { ...PEDIDO, email: "outra@x.com", whatsapp: "5511912345678", documento: null };
    // A conta do primeiro teste já tem a ficha com o e-mail: recusa por ela.
    expect(await iniciarTesteGratis({ ...outro, email: "ANA@exemplo.com.br" }, AGORA, AGORA)).toMatchObject({ ok: false, campo: "email" });
    // Pedido de teste com o e-mail, mesmo sem ficha (a ficha foi apagada): recusa pelo pedido.
    banco.tabelas.corretores = banco.tabelas.corretores.filter((c) => c.grupo_id === "g-nh");
    expect(await iniciarTesteGratis({ ...outro, email: "ANA@exemplo.com.br" }, AGORA, AGORA)).toEqual({
      ok: false,
      erro: MENSAGEM_TESTE_JA_USADO,
      campo: "email",
    });
    expect(await iniciarTesteGratis({ ...outro, whatsapp: PEDIDO.whatsapp }, AGORA, AGORA)).toMatchObject({ ok: false, campo: "whatsapp" });
    expect(await iniciarTesteGratis({ ...outro, documento: PEDIDO.documento }, AGORA, AGORA)).toMatchObject({ ok: false, campo: "documento" });
    expect(banco.tabelas.grupos).toHaveLength(2);
  });

  it("CPF/CNPJ que já é de um grupo recusa", async () => {
    const r = await iniciarTesteGratis({ ...PEDIDO, plano: "imobiliaria", imobiliaria: "Outra", documento: "11222333000181" }, AGORA, AGORA);
    expect(r).toEqual({ ok: false, erro: MENSAGEM_DOCUMENTO_COM_CONTA, campo: "documento" });
  });

  it("a trava do banco (índice único) segura a corrida e vira a mesma frase", async () => {
    const from = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = from(tabela);
      if (tabela !== "pedidos_de_contratacao") return q;
      return { ...q, insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "unique" } }) }) }) } as never;
    };
    expect(await iniciarTesteGratis(PEDIDO, AGORA, AGORA)).toEqual({ ok: false, erro: MENSAGEM_TESTE_JA_USADO });
    expect(banco.tabelas.grupos).toHaveLength(1);
  });

  it("sem CRECI não começa", async () => {
    expect(await iniciarTesteGratis({ ...PEDIDO, creci: null }, AGORA, AGORA)).toMatchObject({ ok: false });
    expect(banco.consultas).toHaveLength(0);
  });

  it("convite que falha desfaz o grupo e solta o pedido (a pessoa pode tentar de novo)", async () => {
    respostaDoLink = { ok: false, motivo: "falha" };
    const r = await iniciarTesteGratis(PEDIDO, AGORA, AGORA);
    expect(r.ok).toBe(false);
    expect(banco.tabelas.grupos).toHaveLength(1);
    expect(banco.tabelas.corretores.filter((c) => c.grupo_id !== "g-nh")).toEqual([]);
    expect(banco.tabelas.pedidos_de_contratacao).toEqual([
      expect.objectContaining({ teste_gratis: false, status: "novo", grupo_criado_id: null }),
    ]);
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({ grupo_id: null, acao: "grupo_desfeito", detalhes: expect.objectContaining({ origem: "teste-gratis", passo: "convite" }) }),
    ]);
    expect(avisos).toHaveLength(0);
  });
});

describe("criarContaComPrimeiroAcesso: a prova da origem", () => {
  const dados = () => {
    const v = validarNovoGrupo({
      nome: "Conta Forjada",
      slug: "conta-forjada",
      tipo: "independente",
      plano: "essencial",
      contatoNome: "",
      contatoEmail: "",
      contatoTelefone: "",
      primeiroNome: "Fulano de Tal",
      primeiroCreci: "1-F",
      primeiroWhatsapp: "5511900001111",
      primeiroEmail: "fulano@x.com",
    });
    if (!v.ok) throw new Error(v.erro);
    return v.dados;
  };
  const pedidoGravado = (sobre: Record<string, unknown>) =>
    banco.tabelas.pedidos_de_contratacao.push({
      id: "p1",
      email: "fulano@x.com",
      status: "novo",
      teste_gratis: true,
      grupo_criado_id: null,
      criado_em: AGORA.toISOString(),
      ...sobre,
    });

  it.each([
    ["pedido que não existe", {}],
    ["pedido sem a marca do teste", { teste_gratis: false }],
    ["pedido já convertido", { status: "convertido" }],
    ["pedido com conta", { grupo_criado_id: "g-x" }],
    ["pedido de outro e-mail", { email: "outro@x.com" }],
    ["pedido velho (mais de 15 min)", { criado_em: new Date(AGORA.getTime() - 16 * 60_000).toISOString() }],
  ])("recusa %s, sem criar nada", async (caso, sobre) => {
    if (caso !== "pedido que não existe") pedidoGravado(sobre);
    const r = await criarContaComPrimeiroAcesso({ origem: "teste-gratis", pedidoId: "p1" }, dados(), undefined, AGORA);
    expect(r.ok).toBe(false);
    expect(banco.tabelas.grupos).toHaveLength(1);
  });

  it("aceita o pedido certo", async () => {
    pedidoGravado({});
    const r = await criarContaComPrimeiroAcesso({ origem: "teste-gratis", pedidoId: "p1" }, dados(), undefined, AGORA);
    expect(r.ok).toBe(true);
  });

  it("origem plataforma: roda a guarda de novo e exige o mesmo login", async () => {
    const semGuarda = await criarContaComPrimeiroAcesso({ origem: "plataforma", userId: "op-1" }, dados(), undefined, AGORA);
    expect(semGuarda).toEqual({ ok: false, erro: "Esta ação é restrita a quem administra a plataforma." });
    guarda = { userId: "op-2" };
    expect((await criarContaComPrimeiroAcesso({ origem: "plataforma", userId: "op-1" }, dados(), undefined, AGORA)).ok).toBe(false);
    expect(banco.tabelas.grupos).toHaveLength(1);
    guarda = { userId: "op-1" };
    expect((await criarContaComPrimeiroAcesso({ origem: "plataforma", userId: "op-1" }, dados(), undefined, AGORA)).ok).toBe(true);
    expect(chamadasDaGuarda).toBe(3);
  });
});
