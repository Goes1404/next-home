import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A plataforma cria o grupo com o primeiro acesso (fase 2A, Task 6).
 *
 * Uma operação só para quem opera: o grupo nasce (`criar_grupo`, 0186), a
 * ficha do primeiro corretor nasce gestora do grupo e o convite sai pelo
 * mesmo caminho do gestor (`convidarCorretorDoGrupo`). Se o convite ou a
 * ficha falham, nada fica para trás — senão o endereço do grupo ficaria
 * queimado pela unicidade e a segunda tentativa não passaria.
 *
 * Clientes falsos para o banco, o Auth e o e-mail; o `criar_grupo` real é
 * medido em `src/lib/grupos/plataforma.db.test.ts`.
 */

const OPERADOR = "operador-1";
const URL_CONVITE = "https://site/auth/confirmar?token_hash=h1&type=invite&next=%2Fcorretor%2Fdefinir-senha";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };
let respostaDoLink: Record<string, unknown>;
let respostaDoEnvio: { enviado: boolean; motivo?: string };
let chamadasDoRpc: { nome: string; args: Record<string, unknown> }[];
let erroDoCriarGrupo: { message: string; code?: string } | null;
const usuariosApagados: string[] = [];

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/auth/links", () => ({
  gerarLinkDeAcesso: async (tipo: string) => respostaDoLink[tipo],
}));
vi.mock("@/lib/auth/emailsDeAcesso", () => ({ enviarLinkDeAcesso: async () => respostaDoEnvio }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { criarGrupoComPrimeiroAcesso, editarDadosDoGrupo } = await import("./acoes");
const { MENSAGEM_EMAIL_EM_USO } = await import("@/lib/corretores/acessoDaConta");

const DADOS = {
  nome: "Imobiliária Silva",
  slug: "imobiliaria-silva",
  tipo: "imobiliaria",
  plano: "profissional",
  contatoNome: "Ana Silva",
  contatoEmail: "financeiro@silva.com.br",
  contatoTelefone: "(11) 99999-0000",
  primeiroNome: "Ana Silva",
  primeiroCreci: "12345-J",
  primeiroWhatsapp: "(11) 98765-4321",
  primeiroEmail: "  Ana@Silva.com.br ",
};

/** O `criar_grupo` falso grava o que o real grava (0186), para o desfazer ter o que apagar. */
function criarGrupoFalso(args: Record<string, unknown>) {
  if (erroDoCriarGrupo) return { data: null, error: erroDoCriarGrupo };
  if (banco.tabelas.grupos.some((g) => g.slug === args.p_slug)) {
    return { data: null, error: { message: `slug em uso: ${args.p_slug}`, code: "23505" } };
  }
  const id = `grupo-${banco.tabelas.grupos.length + 1}`;
  const contato = args.p_contato as Record<string, string>;
  banco.tabelas.grupos.push({
    id,
    nome: args.p_nome,
    slug: args.p_slug,
    tipo: args.p_tipo,
    plano: args.p_plano,
    contato_cobranca_nome: contato.nome,
    contato_cobranca_email: contato.email,
    contato_cobranca_telefone: contato.telefone,
    criado_por: args.p_criado_por,
  });
  banco.tabelas.parametros_credito.push({ grupo_id: id });
  banco.tabelas.fiscal_config.push({ grupo_id: id });
  banco.tabelas.admin_eventos.push({ acao: "grupo_criado", grupo_id: id, ator_plataforma_user_id: args.p_criado_por });
  return { data: id, error: null };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  usuariosApagados.length = 0;
  chamadasDoRpc = [];
  erroDoCriarGrupo = null;
  guarda = { userId: OPERADOR };
  respostaDoLink = { invite: { ok: true, url: URL_CONVITE, userId: "usuario-novo" } };
  respostaDoEnvio = { enviado: false, motivo: "sem_chave" };
  banco = bancoFalso({
    grupos: [{ id: "grupo-nh", nome: "Next Home", slug: "casa-nh", tipo: "imobiliaria", plano: "custo" }],
    corretores: [
      { id: "c-outro", nome: "Beto", slug: "ana-silva", user_id: "usuario-beto", email: "beto@gmail.com", grupo_id: "grupo-nh" },
    ],
    parametros_credito: [{ grupo_id: "grupo-nh" }],
    fiscal_config: [{ grupo_id: "grupo-nh" }],
    admin_eventos: [],
  });
  banco.cliente.rpc = async (nome: string, args: Record<string, unknown>) => {
    chamadasDoRpc.push({ nome, args });
    if (nome === "criar_grupo") return criarGrupoFalso(args);
    return { data: null, error: { message: `rpc inesperado: ${nome}` } };
  };
  banco.cliente.auth = {
    admin: {
      deleteUser: async (id: string) => {
        usuariosApagados.push(id);
        return { data: {}, error: null };
      },
    },
  };
});

const doGrupo = (tabela: string, grupoId: string) => banco.tabelas[tabela].filter((l) => l.grupo_id === grupoId);

describe("criar grupo com o primeiro acesso", () => {
  it("cria grupo, gestor e convite numa operação", async () => {
    const r = await criarGrupoComPrimeiroAcesso(DADOS);

    expect(r).toEqual({ ok: true, grupoId: "grupo-2", email: "ana@silva.com.br", enviado: false, url: URL_CONVITE });
    expect(chamadasDoRpc).toEqual([
      {
        nome: "criar_grupo",
        args: {
          p_nome: "Imobiliária Silva",
          p_slug: "imobiliaria-silva",
          p_tipo: "imobiliaria",
          p_plano: "profissional",
          p_contato: { nome: "Ana Silva", email: "financeiro@silva.com.br", telefone: "5511999990000" },
          p_criado_por: OPERADOR,
        },
      },
    ]);

    const [ficha] = doGrupo("corretores", "grupo-2");
    expect(ficha).toMatchObject({
      nome: "Ana Silva",
      creci: "12345-J",
      whatsapp: "5511987654321",
      papel: "gestor",
      ativo: true,
      user_id: "usuario-novo",
      email: "ana@silva.com.br",
      deve_trocar_senha: true,
    });
    // "ana-silva" já é de uma ficha de outro grupo: o slug é global.
    expect(ficha.slug).toBe("ana-silva-2");

    expect(doGrupo("admin_eventos", "grupo-2")).toEqual([
      expect.objectContaining({ acao: "grupo_criado", ator_plataforma_user_id: OPERADOR }),
      expect.objectContaining({
        acao: "convite_enviado",
        ator_id: null,
        ator_plataforma_user_id: OPERADOR,
        alvo_corretor_id: ficha.id,
      }),
    ]);
  });

  it("com o e-mail enviado, o link não volta para a tela", async () => {
    respostaDoEnvio = { enviado: true };
    const r = await criarGrupoComPrimeiroAcesso(DADOS);
    expect(r).toEqual({ ok: true, grupoId: "grupo-2", email: "ana@silva.com.br", enviado: true });
  });

  it("contato de cobrança em branco vira o do primeiro acesso", async () => {
    await criarGrupoComPrimeiroAcesso({ ...DADOS, contatoNome: " ", contatoEmail: "", contatoTelefone: "" });
    expect(chamadasDoRpc[0].args.p_contato).toEqual({
      nome: "Ana Silva",
      email: "ana@silva.com.br",
      telefone: "5511987654321",
    });
  });

  it("independente nasce gestor", async () => {
    const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, tipo: "independente", plano: "essencial", slug: "ana-corretora" });
    expect(r.ok).toBe(true);
    expect(chamadasDoRpc[0].args).toMatchObject({ p_tipo: "independente", p_plano: "essencial" });
    expect(doGrupo("corretores", "grupo-2")).toEqual([expect.objectContaining({ papel: "gestor" })]);
  });

  it("falha no convite desfaz grupo e corretor", async () => {
    respostaDoLink.invite = { ok: false, motivo: "email_em_uso" };

    const r = await criarGrupoComPrimeiroAcesso(DADOS);

    expect(r).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    for (const tabela of ["grupos", "corretores", "parametros_credito", "fiscal_config", "admin_eventos"]) {
      expect(doGrupo(tabela, "grupo-2"), tabela).toEqual([]);
    }
    expect(banco.tabelas.grupos.map((g) => g.id)).toEqual(["grupo-nh"]);
    // A Next Home não perdeu nada no desfazer.
    expect(doGrupo("parametros_credito", "grupo-nh")).toHaveLength(1);
    expect(banco.tabelas.corretores.map((c) => c.id)).toEqual(["c-outro"]);

    // O endereço fica livre: a segunda tentativa, com o convite de volta, passa.
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-novo" };
    const de_novo = await criarGrupoComPrimeiroAcesso(DADOS);
    expect(de_novo.ok).toBe(true);
  });

  it("convite que volta com o login de outra ficha desfaz o grupo sem apagar esse login", async () => {
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-beto" };

    const r = await criarGrupoComPrimeiroAcesso(DADOS);

    expect(r).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    expect(usuariosApagados).toEqual([]);
    expect(doGrupo("grupos", "grupo-2")).toEqual([]);
    expect(banco.tabelas.corretores.find((c) => c.id === "c-outro")).toMatchObject({ user_id: "usuario-beto" });
  });

  it("vínculo que falha apaga o usuário do convite, a ficha e o grupo", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "corretores") return q;
      const update = q.update;
      q.update = (valores: unknown) => {
        update(valores);
        return {
          eq: () => ({ eq: () => ({ select: async () => ({ data: null, error: { message: "falhou" } }) }) }),
        } as never;
      };
      return q;
    };

    const r = await criarGrupoComPrimeiroAcesso(DADOS);

    expect(r.ok).toBe(false);
    expect(usuariosApagados).toEqual(["usuario-novo"]);
    expect(doGrupo("grupos", "grupo-2")).toEqual([]);
    expect(doGrupo("corretores", "grupo-2")).toEqual([]);
  });

  it("falha ao criar a ficha desfaz o grupo", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "corretores") return q;
      q.insert = () =>
        ({ select: () => ({ single: async () => ({ data: null, error: { message: "creci repetido" } }) }) }) as never;
      return q;
    };

    const r = await criarGrupoComPrimeiroAcesso(DADOS);

    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/primeiro acesso/) });
    expect(doGrupo("grupos", "grupo-2")).toEqual([]);
    expect(doGrupo("admin_eventos", "grupo-2")).toEqual([]);
  });

  it("slug reservado é recusado antes de chamar o banco", async () => {
    const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, slug: "admin" });
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/reservado/) });
    expect(chamadasDoRpc).toEqual([]);
    expect(banco.consultas).toEqual([]);
  });

  it("tipo, plano, endereço e e-mail inválidos são recusados com frase, antes do banco", async () => {
    const casos: [Partial<typeof DADOS>, RegExp][] = [
      [{ slug: "Com Espaço" }, /endereço/i],
      [{ slug: "ab" }, /endereço/i],
      [{ tipo: "loja" }, /tipo/i],
      [{ plano: "gratis" }, /plano/i],
      [{ primeiroEmail: "sem-arroba" }, /e-mail/i],
      [{ primeiroEmail: "fulano@nexthome.com" }, /provisório/i],
      [{ contatoEmail: "ruim" }, /cobrança/i],
      [{ primeiroWhatsapp: "123" }, /whatsapp/i],
      [{ primeiroCreci: " " }, /creci/i],
      [{ nome: "x" }, /nome do grupo/i],
    ];
    for (const [mudanca, frase] of casos) {
      const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, ...mudanca });
      expect(r, JSON.stringify(mudanca)).toEqual({ ok: false, erro: expect.stringMatching(frase) });
    }
    expect(chamadasDoRpc).toEqual([]);
    expect(banco.consultas).toEqual([]);
  });

  it("e-mail que já é de uma ficha é recusado antes de criar o grupo, sem dizer de qual", async () => {
    const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, primeiroEmail: "BETO@gmail.com" });
    expect(r).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    expect(chamadasDoRpc).toEqual([]);
  });

  it("endereço já usado por outro grupo volta como frase, não como erro do banco", async () => {
    const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, slug: "casa-nh" });
    expect(r).toEqual({ ok: false, erro: "Esse endereço já é de outro grupo. Escolha outro." });
  });

  it("erro inesperado do criar_grupo não vaza a mensagem do banco", async () => {
    erroDoCriarGrupo = { message: "taxas de crédito da Next Home ausentes", code: "P0001" };
    const r = await criarGrupoComPrimeiroAcesso(DADOS);
    expect(r).toEqual({ ok: false, erro: "Não foi possível criar o grupo agora. Tente de novo." });
  });

  it("quem não é administrador não cria grupo", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const r = await criarGrupoComPrimeiroAcesso(DADOS);
    expect(r).toEqual({ ok: false, erro: "Esta ação é restrita a quem administra a plataforma." });
    expect(chamadasDoRpc).toEqual([]);
    expect(banco.consultas).toEqual([]);
  });
});

describe("editar os dados do grupo", () => {
  const INSTITUCIONAL = {
    contatoNome: "Carla",
    contatoEmail: "Carla@NH.com.br",
    contatoTelefone: "11 3333-4444",
    razaoSocial: " Next Home Negócios Imobiliários Ltda ",
    documento: "12.345.678/0001-90",
    creci: "12345",
    creciTipo: "J",
    encarregadoNome: "Davi",
    encarregadoEmail: "lgpd@nh.com.br",
  };

  it("grava contato e institucionais, e o plano não muda", async () => {
    const r = await editarDadosDoGrupo("grupo-nh", { ...INSTITUCIONAL, plano: "essencial" } as never);

    expect(r).toEqual({ ok: true });
    expect(banco.tabelas.grupos[0]).toMatchObject({
      plano: "custo",
      contato_cobranca_nome: "Carla",
      contato_cobranca_email: "carla@nh.com.br",
      contato_cobranca_telefone: "551133334444",
      razao_social: "Next Home Negócios Imobiliários Ltda",
      documento: "12345678000190",
      creci: "12345",
      creci_tipo: "J",
      encarregado_lgpd_nome: "Davi",
      encarregado_lgpd_email: "lgpd@nh.com.br",
    });
  });

  it("campo em branco vira vazio, não texto em branco", async () => {
    await editarDadosDoGrupo("grupo-nh", {
      ...INSTITUCIONAL,
      razaoSocial: "  ",
      documento: "",
      creci: "",
      creciTipo: "",
      encarregadoEmail: "",
    });
    expect(banco.tabelas.grupos[0]).toMatchObject({
      razao_social: null,
      documento: null,
      creci: null,
      creci_tipo: null,
      encarregado_lgpd_email: null,
    });
  });

  it("documento e e-mails inválidos são recusados com frase", async () => {
    for (const [mudanca, frase] of [
      [{ documento: "123" }, /CPF ou CNPJ/],
      [{ contatoEmail: "x" }, /cobrança/i],
      [{ encarregadoEmail: "y" }, /encarregado/i],
      [{ creciTipo: "Z" }, /CRECI/],
    ] as const) {
      const r = await editarDadosDoGrupo("grupo-nh", { ...INSTITUCIONAL, ...mudanca });
      expect(r, JSON.stringify(mudanca)).toEqual({ ok: false, erro: expect.stringMatching(frase) });
    }
    expect(banco.consultas).toEqual([]);
  });

  it("grupo que não existe não finge que salvou", async () => {
    const r = await editarDadosDoGrupo("grupo-inexistente", INSTITUCIONAL);
    expect(r).toEqual({ ok: false, erro: "Grupo não encontrado." });
  });

  it("quem não é administrador não edita", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const r = await editarDadosDoGrupo("grupo-nh", INSTITUCIONAL);
    expect(r.ok).toBe(false);
    expect(banco.consultas).toEqual([]);
  });
});
