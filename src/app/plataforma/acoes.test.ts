import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A plataforma cria o grupo com o primeiro acesso (fase 2A, Task 6).
 *
 * Uma operação só para quem opera: o grupo nasce (`criar_grupo`, 0195), a
 * ficha do primeiro corretor nasce gestora do grupo e o convite sai pelo
 * mesmo caminho do gestor (`convidarCorretorDoGrupo`). Se o convite ou a
 * ficha falham, nada fica para trás — senão o endereço do grupo ficaria
 * queimado pela unicidade e a segunda tentativa não passaria.
 *
 * Clientes falsos para o banco, o Auth e o e-mail; o `criar_grupo` real é
 * medido em `src/lib/grupos/plataforma.db.test.ts`.
 */

const OPERADOR = "operador-1";
/** Id de grupo com cara de uuid: `editarDadosDoGrupo` recusa o resto antes do banco. */
const G_NH = "00000000-0000-4000-8000-0000000000aa";
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

const {
  ajustarTetoDaIa,
  criarAcessoPendenteDoGrupo,
  criarCorretorIndependente,
  criarGrupoComPrimeiroAcesso,
  criarImobiliaria,
  editarDadosDoGrupo,
  redefinirSenhaDoAcesso,
} = await import("./acoes");
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

/** O `criar_grupo` falso grava o que o real grava (0195), para o desfazer ter o que apagar. */
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
    grupos: [{ id: G_NH, nome: "Next Home", slug: "casa-nh", tipo: "imobiliaria", plano: "custo" }],
    corretores: [
      { id: "c-outro", nome: "Beto", slug: "ana-silva", user_id: "usuario-beto", email: "Beto@Gmail.com", grupo_id: G_NH },
    ],
    parametros_credito: [{ grupo_id: G_NH }],
    fiscal_config: [{ grupo_id: G_NH }],
    admin_eventos: [],
  });
  banco.cliente.rpc = async (nome: string, args: Record<string, unknown>) => {
    chamadasDoRpc.push({ nome, args });
    if (nome === "criar_grupo") return criarGrupoFalso(args);
    return { data: null, error: { message: `rpc inesperado: ${nome}` } };
  };
  banco.cliente.auth = {
    admin: {
      createUser: async () => ({ data: { user: { id: "usuario-criado" } }, error: null }),
      deleteUser: async (id: string) => {
        usuariosApagados.push(id);
        return { data: {}, error: null };
      },
    },
  };
});

/** As linhas do grupo; em `grupos` a chave é `id` (sem isso, "o grupo sumiu" passaria sempre). */
const doGrupo = (tabela: string, grupoId: string) =>
  banco.tabelas[tabela].filter((l) => (tabela === "grupos" ? l.id : l.grupo_id) === grupoId);

function formDoAcesso(email: string, papel: "gestor" | "corretor" = "corretor") {
  const form = new FormData();
  form.set("email", email);
  form.set("senha", "senha-temporaria-1");
  form.set("papel", papel);
  return form;
}

describe("acesso de grupo já criado pela plataforma", () => {
  it("cria login com senha temporária e ficha pendente, oculta, sem inventar dados profissionais", async () => {
    const r = await criarAcessoPendenteDoGrupo(G_NH, undefined, formDoAcesso("corretor@silva.com", "gestor"));

    expect(r).toEqual({ ok: true, email: "corretor@silva.com", papel: "gestor" });
    expect(doGrupo("corretores", G_NH)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "corretor@silva.com",
          papel: "gestor",
          nome: "Cadastro pendente",
          creci: expect.stringMatching(/^PENDENTE-/),
          whatsapp: "5511000000000",
          oculta: true,
          user_id: "usuario-criado",
          deve_trocar_senha: true,
        }),
      ]),
    );
    expect(banco.tabelas.admin_eventos).toEqual(
      expect.arrayContaining([expect.objectContaining({ acao: "conta_criada", ator_plataforma_user_id: OPERADOR })]),
    );
  });

  it("recusa quem não é administrador da plataforma antes de consultar o banco", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    await expect(criarAcessoPendenteDoGrupo(G_NH, undefined, formDoAcesso("corretor@silva.com"))).resolves.toEqual({
      ok: false,
      erro: "Esta ação é restrita a quem administra a plataforma.",
    });
    expect(banco.consultas).toEqual([]);
  });
});

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
    expect(banco.tabelas.grupos.map((g) => g.id)).toEqual([G_NH]);
    // A Next Home não perdeu nada no desfazer.
    expect(doGrupo("parametros_credito", G_NH)).toHaveLength(1);
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

  it("curinga do like no e-mail digitado não casa com a ficha de outra pessoa", async () => {
    banco.tabelas.corretores.push(
      { id: "c-x", nome: "X", slug: "x", user_id: null, email: "ana1silva@silva.com.br", grupo_id: G_NH },
      { id: "c-y", nome: "Y", slug: "y", user_id: null, email: "anaxyz@silva.com.br", grupo_id: G_NH },
    );
    for (const [i, email] of ["ana_silva@silva.com.br", "ana%@silva.com.br", "ana*@silva.com.br"].entries()) {
      chamadasDoRpc = [];
      const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, slug: `grupo-curinga-${i}`, primeiroEmail: email });
      expect(chamadasDoRpc.map((c) => c.nome), email).toEqual(["criar_grupo"]);
      expect(r.ok, email).toBe(true);
      // O próximo e-mail precisa de grupo e ficha novos.
      banco.tabelas.corretores = banco.tabelas.corretores.filter((c) => c.grupo_id === G_NH);
      banco.tabelas.grupos = banco.tabelas.grupos.filter((g) => g.id === G_NH);
    }
  });

  it("o desfazer deixa um evento da plataforma, sem e-mail nem nome", async () => {
    respostaDoLink.invite = { ok: false, motivo: "falha" };

    await criarGrupoComPrimeiroAcesso(DADOS);

    const daPlataforma = banco.tabelas.admin_eventos.filter((e) => e.grupo_id === null);
    expect(daPlataforma).toEqual([
      {
        id: expect.any(String),
        grupo_id: null,
        acao: "grupo_desfeito",
        ator_id: null,
        ator_plataforma_user_id: OPERADOR,
        alvo_corretor_id: null,
        detalhes: { origem: "plataforma", slug: "imobiliaria-silva", passo: "convite", desfeito: true },
      },
    ]);
    const texto = JSON.stringify(daPlataforma);
    expect(texto).not.toMatch(/@/);
    expect(texto).not.toMatch(/Ana|Silva/);
  });

  it("ficha que falha também deixa o evento, com o passo", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "corretores") return q;
      q.insert = () =>
        ({ select: () => ({ single: async () => ({ data: null, error: { message: "creci repetido" } }) }) }) as never;
      return q;
    };

    await criarGrupoComPrimeiroAcesso(DADOS);

    expect(banco.tabelas.admin_eventos.filter((e) => e.grupo_id === null)).toEqual([
      expect.objectContaining({ acao: "grupo_desfeito", detalhes: expect.objectContaining({ passo: "ficha", desfeito: true }) }),
    ]);
  });

  it("desfazer que para no meio diz no evento que o grupo ficou", async () => {
    respostaDoLink.invite = { ok: false, motivo: "falha" };
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "fiscal_config") return q;
      q.delete = () => ({ eq: async () => ({ data: null, error: { message: "travado" } }) }) as never;
      return q;
    };

    await criarGrupoComPrimeiroAcesso(DADOS);

    expect(doGrupo("grupos", "grupo-2")).toHaveLength(1);
    expect(banco.tabelas.admin_eventos.filter((e) => e.grupo_id === null)).toEqual([
      expect.objectContaining({ detalhes: expect.objectContaining({ passo: "convite", desfeito: false }) }),
    ]);
  });

  it("a ordem do desfazer é a constante que o teste de banco usa", async () => {
    const { ORDEM_DO_DESFAZER } = await import("@/lib/plataforma/desfazerGrupo");
    respostaDoLink.invite = { ok: false, motivo: "falha" };

    await criarGrupoComPrimeiroAcesso(DADOS);

    const apagados = banco.consultas.filter((c) => c.operacao === "delete").map((c) => [c.tabela, c.filtros[0]]);
    expect(apagados).toEqual(ORDEM_DO_DESFAZER.map(({ tabela, coluna }) => [tabela, `eq:${coluna}`]));
  });

  describe("login criado pelo convite e não conferido", () => {
    /** As `n` primeiras leituras de `corretores` por `user_id` falham (erro transitório). */
    function falharLeiturasPorUserId(n: number) {
      let restantes = n;
      const original = banco.cliente.from;
      banco.cliente.from = (tabela: string) => {
        const q = original(tabela);
        if (tabela !== "corretores") return q;
        const eq = q.eq;
        q.eq = ((col: string, v: unknown) => {
          if (col === "user_id" && restantes > 0) {
            restantes--;
            const erro = { data: null, count: null, error: { message: "timeout" } };
            return { maybeSingle: async () => erro, then: (r: (x: typeof erro) => unknown) => Promise.resolve(erro).then(r) };
          }
          return eq(col, v);
        }) as never;
        return q;
      };
    }

    it("é apagado no desfazer se não tem outra ficha", async () => {
      falharLeiturasPorUserId(1);
      const r = await criarGrupoComPrimeiroAcesso(DADOS);
      expect(r.ok).toBe(false);
      expect(usuariosApagados).toEqual(["usuario-novo"]);
      expect(doGrupo("grupos", "grupo-2")).toEqual([]);
    });

    it("não é apagado se é de outra ficha", async () => {
      respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-beto" };
      falharLeiturasPorUserId(1);
      await criarGrupoComPrimeiroAcesso(DADOS);
      expect(usuariosApagados).toEqual([]);
    });

    it("não é apagado se a segunda conferência também falha", async () => {
      falharLeiturasPorUserId(2);
      await criarGrupoComPrimeiroAcesso(DADOS);
      expect(usuariosApagados).toEqual([]);
    });
  });

  it("endereço já usado por outro grupo volta como frase, não como erro do banco", async () => {
    const r = await criarGrupoComPrimeiroAcesso({ ...DADOS, slug: "casa-nh" });
    expect(r).toEqual({ ok: false, erro: "Esse endereço já é de outro grupo. Escolha outro." });
  });

  it("erro inesperado do criar_grupo não vaza a mensagem do banco", async () => {
    erroDoCriarGrupo = { message: "taxas de crédito da Next Home ausentes", code: "P0001" };
    const r = await criarGrupoComPrimeiroAcesso(DADOS);
    expect(r.ok).toBe(false);
    const erro = r.ok ? "" : r.erro;
    expect(erro).not.toContain("taxas");
    // Erro que não é de endereço repetido pode ter acontecido DEPOIS de o
    // grupo nascer (a resposta se perdeu): a frase manda olhar a lista antes
    // de tentar de novo, e não culpa o endereço.
    expect(erro).toMatch(/lista de grupos/);
    expect(erro).not.toMatch(/endereço/i);
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
    const r = await editarDadosDoGrupo(G_NH, { ...INSTITUCIONAL, plano: "essencial" } as never);

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
    await editarDadosDoGrupo(G_NH, {
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
      const r = await editarDadosDoGrupo(G_NH, { ...INSTITUCIONAL, ...mudanca });
      expect(r, JSON.stringify(mudanca)).toEqual({ ok: false, erro: expect.stringMatching(frase) });
    }
    expect(banco.consultas).toEqual([]);
  });

  it("grupo que não existe não finge que salvou", async () => {
    const r = await editarDadosDoGrupo("00000000-0000-4000-8000-0000000000ff", INSTITUCIONAL);
    expect(r).toEqual({ ok: false, erro: "Grupo não encontrado." });
  });

  it("id fora do formato de uuid não chega ao banco", async () => {
    for (const id of ["grupo-nh", "", "1; drop table grupos", "00000000-0000-4000-8000-0000000000aaX"]) {
      const r = await editarDadosDoGrupo(id, INSTITUCIONAL);
      expect(r, id).toEqual({ ok: false, erro: "Grupo não encontrado." });
    }
    expect(banco.consultas).toEqual([]);
  });

  it("quem não é administrador não edita", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const r = await editarDadosDoGrupo(G_NH, INSTITUCIONAL);
    expect(r.ok).toBe(false);
    expect(banco.consultas).toEqual([]);
  });
});

describe("ajustar o teto de respostas da IA do grupo (fase 2B)", () => {
  it("grava o teto e deixa o evento com o antes e o depois", async () => {
    const r = await ajustarTetoDaIa(G_NH, " 1.500 ");
    expect(r).toEqual({ ok: true });
    expect(banco.tabelas.grupos[0].teto_respostas_ia).toBe(1500);
    expect(banco.tabelas.admin_eventos).toContainEqual(
      expect.objectContaining({
        acao: "cota_da_ia_ajustada",
        grupo_id: G_NH,
        ator_plataforma_user_id: OPERADOR,
        detalhes: { origem: "plataforma", antes: null, depois: 1500 },
      }),
    );
  });

  it("em branco volta ao padrão do plano", async () => {
    banco.tabelas.grupos[0].teto_respostas_ia = 300;
    const r = await ajustarTetoDaIa(G_NH, "");
    expect(r).toEqual({ ok: true });
    expect(banco.tabelas.grupos[0].teto_respostas_ia).toBeNull();
  });

  it("número inválido é recusado com frase, antes do banco", async () => {
    for (const texto of ["abc", "-5", "1,5", "99999999"]) {
      const r = await ajustarTetoDaIa(G_NH, texto);
      expect(r, texto).toEqual({ ok: false, erro: expect.stringMatching(/número/i) });
    }
    expect(banco.consultas).toEqual([]);
  });

  it("grupo que não existe não finge que salvou", async () => {
    const r = await ajustarTetoDaIa("00000000-0000-4000-8000-0000000000ff", "100");
    expect(r).toEqual({ ok: false, erro: "Grupo não encontrado." });
  });

  it("quem não é administrador não ajusta", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const r = await ajustarTetoDaIa(G_NH, "100");
    expect(r.ok).toBe(false);
    expect(banco.consultas).toEqual([]);
  });
});

describe("criação por tipo de conta (imobiliária e corretor independente)", () => {
  const IMOBILIARIA = {
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
    gestorEmail: "ana@silva.com.br",
    gestorWhatsapp: "(11) 98765-4321",
  };
  const INDEPENDENTE = {
    nome: "Carla Corretora",
    slug: "carla-corretora",
    cpf: "529.982.247-25",
    creciF: "98765-F",
    email: "carla@gmail.com",
    whatsapp: "(11) 91234-5678",
    plano: "profissional",
    mensalidade: "",
    diaDoVencimento: "5",
  };

  it("imobiliária: mesma RPC, cadastro gravado e gestor com convite", async () => {
    const r = await criarImobiliaria(IMOBILIARIA);

    expect(r).toEqual({ ok: true, grupoId: "grupo-2", email: "ana@silva.com.br", enviado: false, url: URL_CONVITE });
    expect(chamadasDoRpc).toHaveLength(1);
    expect(chamadasDoRpc[0].args).toMatchObject({ p_tipo: "imobiliaria", p_plano: "imobiliaria" });
    expect(doGrupo("grupos", "grupo-2")[0]).toMatchObject({
      razao_social: "Silva Negócios Imobiliários Ltda",
      documento: "11222333000181",
      creci: "12345-J",
      creci_tipo: "J",
      mensalidade: 508,
      dia_do_vencimento: 10,
    });
    expect(doGrupo("corretores", "grupo-2")).toEqual([expect.objectContaining({ papel: "gestor", user_id: "usuario-novo" })]);
  });

  it("independente: o corretor vira gestor e contato de cobrança, com CPF e mensalidade do plano", async () => {
    const r = await criarCorretorIndependente(INDEPENDENTE);

    expect(r).toEqual({ ok: true, grupoId: "grupo-2", email: "carla@gmail.com", enviado: false, url: URL_CONVITE });
    expect(chamadasDoRpc[0].args).toMatchObject({
      p_nome: "Carla Corretora",
      p_tipo: "independente",
      p_plano: "profissional",
      p_contato: { nome: "Carla Corretora", email: "carla@gmail.com", telefone: "5511912345678" },
    });
    expect(doGrupo("grupos", "grupo-2")[0]).toMatchObject({
      razao_social: null,
      documento: "52998224725",
      creci: "98765-F",
      creci_tipo: "F",
      mensalidade: 147,
      dia_do_vencimento: 5,
    });
    expect(doGrupo("corretores", "grupo-2")).toEqual([
      expect.objectContaining({ papel: "gestor", nome: "Carla Corretora", creci: "98765-F" }),
    ]);
  });

  it("documento inválido é recusado antes do banco", async () => {
    expect(await criarImobiliaria({ ...IMOBILIARIA, cnpj: "11.222.333/0001-80" })).toEqual({
      ok: false,
      erro: expect.stringMatching(/CNPJ/),
    });
    expect(await criarCorretorIndependente({ ...INDEPENDENTE, cpf: "123.456.789-00" })).toEqual({
      ok: false,
      erro: expect.stringMatching(/CPF/),
    });
    expect(chamadasDoRpc).toEqual([]);
  });

  it("quem não administra a plataforma é recusado nas duas ações", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const esperado = { ok: false, erro: "Esta ação é restrita a quem administra a plataforma." };
    expect(await criarImobiliaria(IMOBILIARIA)).toEqual(esperado);
    expect(await criarCorretorIndependente(INDEPENDENTE)).toEqual(esperado);
    expect(chamadasDoRpc).toEqual([]);
    expect(banco.consultas).toEqual([]);
  });

  it("convite que falha desfaz o grupo também nos fluxos por tipo", async () => {
    respostaDoLink.invite = { ok: false, motivo: "falha" };
    const r = await criarCorretorIndependente(INDEPENDENTE);
    expect(r.ok).toBe(false);
    expect(banco.tabelas.grupos.map((g) => g.id)).toEqual([G_NH]);
  });

  it("falha ao gravar o cadastro desfaz o grupo", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "grupos") return q;
      q.update = () =>
        ({ eq: () => ({ select: async () => ({ data: null, error: { message: "falhou" } }) }) }) as never;
      return q;
    };
    const r = await criarImobiliaria(IMOBILIARIA);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/dados do grupo/) });
    expect(banco.tabelas.grupos.map((g) => g.id)).toEqual([G_NH]);
    expect(banco.tabelas.admin_eventos.filter((e) => e.grupo_id === null)).toEqual([
      expect.objectContaining({ detalhes: expect.objectContaining({ passo: "cadastro" }) }),
    ]);
  });
});

describe("redefinir a senha de um acesso pela plataforma", () => {
  const C_BETO = "00000000-0000-4000-8000-0000000000b1";
  const C_ADMIN = "00000000-0000-4000-8000-0000000000b2";
  let senhasTrocadas: { userId: string; atributos: Record<string, unknown> }[];
  let erroDaSenha: { message: string; code?: string } | null;
  let sessoesEncerradas: string[];
  let erroDasSessoes: { message: string } | null;

  beforeEach(() => {
    senhasTrocadas = [];
    erroDaSenha = null;
    sessoesEncerradas = [];
    erroDasSessoes = null;
    const rpcDoGrupo = banco.cliente.rpc as (nome: string, args: Record<string, unknown>) => Promise<unknown>;
    banco.cliente.rpc = async (nome: string, args: Record<string, unknown>) => {
      if (nome !== "encerrar_sessoes_do_usuario") return rpcDoGrupo(nome, args);
      if (!erroDasSessoes) sessoesEncerradas.push(String(args.p_user_id));
      return { data: erroDasSessoes ? null : 2, error: erroDasSessoes };
    };
    banco.tabelas.corretores.push(
      { id: C_BETO, nome: "Beto", user_id: "usuario-beto-2", email: "beto@aretz.com", grupo_id: G_NH, deve_trocar_senha: false },
      { id: C_ADMIN, nome: "Dono", user_id: "usuario-dono", email: "dono@x.com", grupo_id: G_NH, deve_trocar_senha: false },
    );
    banco.tabelas.administradores_da_plataforma = [{ user_id: "usuario-dono" }];
    (banco.cliente.auth as { admin: Record<string, unknown> }).admin.updateUserById = async (userId: string, atributos: Record<string, unknown>) => {
      senhasTrocadas.push({ userId, atributos });
      return { data: { user: { id: userId } }, error: erroDaSenha };
    };
  });

  const formDaSenha = (senha = "provisoria-123") => {
    const form = new FormData();
    form.set("senha", senha);
    return form;
  };
  const ficha = (id: string) => banco.tabelas.corretores.find((c) => c.id === id);

  it("troca a senha no Auth, liga a troca obrigatória e audita sem a senha", async () => {
    const r = await redefinirSenhaDoAcesso(G_NH, C_BETO, undefined, formDaSenha());

    expect(r).toEqual({ ok: true, nome: "Beto", sessoesEncerradas: true });
    expect(senhasTrocadas).toEqual([{ userId: "usuario-beto-2", atributos: { password: "provisoria-123" } }]);
    expect(sessoesEncerradas).toEqual(["usuario-beto-2"]);
    expect(ficha(C_BETO)?.deve_trocar_senha).toBe(true);
    const eventos = banco.tabelas.admin_eventos.filter((e) => e.acao === "senha_redefinida");
    expect(eventos).toEqual([
      expect.objectContaining({ grupo_id: G_NH, ator_plataforma_user_id: OPERADOR, alvo_corretor_id: C_BETO }),
    ]);
    expect(JSON.stringify(banco.tabelas)).not.toContain("provisoria-123");
  });

  it("sessões que não se encerram não desfazem a senha; a tela fica sabendo", async () => {
    erroDasSessoes = { message: "permission denied" };
    const r = await redefinirSenhaDoAcesso(G_NH, C_BETO, undefined, formDaSenha());
    expect(r).toEqual({ ok: true, nome: "Beto", sessoesEncerradas: false });
    expect(senhasTrocadas).toHaveLength(1);
    expect(banco.tabelas.admin_eventos.find((e) => e.acao === "senha_redefinida")?.detalhes).toEqual({
      origem: "plataforma",
      sessoes_encerradas: false,
    });
  });

  it("senha recusada pelo Auth não encerra as sessões de ninguém", async () => {
    erroDaSenha = { message: "boom" };
    await redefinirSenhaDoAcesso(G_NH, C_BETO, undefined, formDaSenha());
    expect(sessoesEncerradas).toEqual([]);
  });

  it("recusa quem não administra a plataforma antes do banco", async () => {
    guarda = { erro: "Esta ação é restrita a quem administra a plataforma." };
    const r = await redefinirSenhaDoAcesso(G_NH, C_BETO, undefined, formDaSenha());
    expect(r).toEqual({ ok: false, erro: "Esta ação é restrita a quem administra a plataforma." });
    expect(banco.consultas).toEqual([]);
    expect(senhasTrocadas).toEqual([]);
  });

  it("recusa senha curta e acesso de outro grupo", async () => {
    expect(await redefinirSenhaDoAcesso(G_NH, C_BETO, undefined, formDaSenha("curta"))).toMatchObject({ ok: false });
    const outroGrupo = "00000000-0000-4000-8000-0000000000cc";
    expect(await redefinirSenhaDoAcesso(outroGrupo, C_BETO, undefined, formDaSenha())).toEqual({
      ok: false,
      erro: "Acesso não encontrado.",
    });
    expect(senhasTrocadas).toEqual([]);
  });

  it("não mexe na senha de outro administrador da plataforma", async () => {
    const r = await redefinirSenhaDoAcesso(G_NH, C_ADMIN, undefined, formDaSenha());
    expect(r).toMatchObject({ ok: false });
    expect(senhasTrocadas).toEqual([]);
    expect(ficha(C_ADMIN)?.deve_trocar_senha).toBe(false);
  });

  it("Auth recusando a senha devolve a troca obrigatória ao que era", async () => {
    erroDaSenha = { message: "Password is too weak", code: "weak_password" };
    const r = await redefinirSenhaDoAcesso(G_NH, C_BETO, undefined, formDaSenha());
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/fraca/) });
    expect(ficha(C_BETO)?.deve_trocar_senha).toBe(false);
    expect(banco.tabelas.admin_eventos.filter((e) => e.acao === "senha_redefinida")).toEqual([]);
  });
});
