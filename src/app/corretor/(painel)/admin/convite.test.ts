import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../test/bancoFalso";
import { semComentarios } from "@/lib/grupos/codigoFonte";

/**
 * O gestor convida em vez de entregar senha (fase 2A, Task 5).
 *
 * Até aqui o gestor recebia uma senha em claro e a repassava pelo WhatsApp,
 * e o lote inventava `nome@nexthome.com` — domínio de TERCEIRO — com senha
 * `nexthome` + 4 dígitos do telefone. Agora a pessoa recebe um link no
 * e-mail real e cria a própria senha. Sem e-mail configurado, o link volta
 * para a tela, e o gestor o manda pelo WhatsApp.
 *
 * Clientes falsos para Auth e e-mail: a frente 2 não tem banco local.
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";
const URL_CONVITE = "https://site/auth/confirmar?token_hash=h1&type=invite&next=%2Fcorretor%2Fdefinir-senha";
const URL_SENHA = "https://site/auth/confirmar?token_hash=h2&type=recovery&next=%2Fcorretor%2Fdefinir-senha";

let banco: BancoFalso;
let emailLivre: boolean | null;
let respostaDoLink: Record<string, unknown>;
let respostaDoEnvio: { enviado: boolean; motivo?: string; id?: string | null };
let usuarioDoAuth: { id: string; email: string; last_sign_in_at: string | null } | null;
let erroDoAuth: { message: string } | null;
let erroAoTrocarEmail: { message: string; code?: string } | null;
const pedidosDeLink: unknown[][] = [];
const enviados: unknown[][] = [];
const usuariosApagados: string[] = [];
const trocasNoAuth: { id: string; dados: Record<string, unknown> }[] = [];

vi.mock("@/lib/guardas", () => ({
  exigirGestorNaAcao: async () => ({ corretor: { id: "gestor-a", grupoId: GRUPO_A, papel: "gestor" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => banco.cliente }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/auth/links", () => ({
  gerarLinkDeAcesso: async (...args: unknown[]) => {
    pedidosDeLink.push(args);
    return respostaDoLink[args[0] as string];
  },
}));
vi.mock("@/lib/auth/emailsDeAcesso", () => ({
  enviarLinkDeAcesso: async (...args: unknown[]) => {
    enviados.push(args);
    return respostaDoEnvio;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/catalogo/revalidar", () => ({ revalidarCorretores: () => {} }));

const { cadastrarCorretor, criarAcessoCorretor, reenviarConvite, trocarEmailDoCorretor, enviarLinkDeSenha } = await import(
  "./acoes"
);
const {
  acoesDeAcesso,
  MENSAGEM_ADMIN_DA_PLATAFORMA,
  MENSAGEM_EMAIL_DE_CONTA_USADA,
  MENSAGEM_EMAIL_EM_USO,
  MENSAGEM_ENDERECO_PROVISORIO,
  MENSAGEM_OUTRO_GESTOR,
} = await import("@/lib/corretores/acessoDaConta");
const { MENSAGEM_EMAIL_NAO_SAIU, MENSAGEM_SEM_EMAIL_CONFIGURADO } = await import("@/lib/corretores/convite");

beforeEach(() => {
  vi.unstubAllEnvs();
  // Sem chave de e-mail, como no ambiente de quem desenvolve; os testes do
  // link "só por e-mail" ligam a chave quando precisam.
  vi.stubEnv("RESEND_API_KEY", "");
  erroDoAuth = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  pedidosDeLink.length = 0;
  enviados.length = 0;
  usuariosApagados.length = 0;
  trocasNoAuth.length = 0;
  emailLivre = true;
  erroAoTrocarEmail = null;
  usuarioDoAuth = null;
  respostaDoLink = {
    invite: { ok: true, url: URL_CONVITE, userId: "usuario-novo" },
    recovery: { ok: true, url: URL_SENHA, userId: "usuario-1" },
  };
  respostaDoEnvio = { enviado: false, motivo: "sem_chave" };
  banco = bancoFalso({
    corretores: [
      { id: "c1", nome: "Ana Lima", slug: "ana-lima", user_id: null, email: null, grupo_id: GRUPO_A },
      { id: "c2", nome: "Beto de Outro Grupo", slug: "beto", user_id: "usuario-b", email: "beto@gmail.com", grupo_id: GRUPO_B },
      { id: "c3", nome: "Carla", slug: "carla", user_id: "usuario-1", email: "carla@gmail.com", grupo_id: GRUPO_A },
      { id: "c4", nome: "Duda", slug: "duda", user_id: "usuario-4", email: "duda@nexthome.com", grupo_id: GRUPO_A },
    ],
    grupos: [
      { id: GRUPO_A, nome: "Imobiliária Sol" },
      { id: GRUPO_B, nome: "Imobiliária Lua" },
    ],
    admin_eventos: [],
  });
  banco.cliente.rpc = async (nome: string) => {
    if (nome === "email_de_acesso_livre") {
      // `null` simula a conferência que FALHOU (erro do banco), não um "não".
      return emailLivre === null ? { data: null, error: { message: "timeout" } } : { data: emailLivre, error: null };
    }
    if (nome === "slug_de_corretor_livre") return { data: true, error: null };
    return { data: null, error: null };
  };
  banco.cliente.auth = {
    admin: {
      getUserById: async (id: string) =>
        erroDoAuth
          ? { data: { user: null }, error: erroDoAuth }
          : { data: { user: usuarioDoAuth && usuarioDoAuth.id === id ? usuarioDoAuth : null }, error: null },
      updateUserById: async (id: string, dados: Record<string, unknown>) => {
        trocasNoAuth.push({ id, dados });
        if (erroAoTrocarEmail && "email_confirm" in dados && dados.email !== usuarioDoAuth?.email) {
          return { data: { user: null }, error: erroAoTrocarEmail };
        }
        return { data: { user: { id } }, error: null };
      },
      deleteUser: async (id: string) => {
        usuariosApagados.push(id);
        return { data: {}, error: null };
      },
    },
  };
});

const eventos = () => banco.tabelas.admin_eventos;
const corretor = (id: string) => banco.tabelas.corretores.find((c) => c.id === id)!;

describe("convidar", () => {
  it("convidar vincula, registra e devolve link quando o e-mail não sai", async () => {
    const r = await criarAcessoCorretor("c1", "  Ana@Gmail.com ");

    expect(r).toEqual({ ok: true, enviado: false, url: URL_CONVITE });
    expect(pedidosDeLink).toEqual([["invite", "ana@gmail.com", "/corretor/definir-senha"]]);
    expect(enviados).toEqual([["invite", "ana@gmail.com", "Imobiliária Sol", URL_CONVITE]]);
    expect(corretor("c1")).toMatchObject({
      user_id: "usuario-novo",
      email: "ana@gmail.com",
      deve_trocar_senha: true,
    });
    expect(eventos()).toHaveLength(1);
    expect(eventos()[0]).toMatchObject({
      acao: "convite_enviado",
      ator_id: "gestor-a",
      alvo_corretor_id: "c1",
      grupo_id: GRUPO_A,
    });
    expect(JSON.stringify(eventos()[0])).not.toMatch(/senha/i);
  });

  it("com o e-mail enviado, o link não volta para a tela", async () => {
    respostaDoEnvio = { enviado: true, id: "msg-1" };
    const r = await criarAcessoCorretor("c1", "ana@gmail.com");
    expect(r).toEqual({ ok: true, enviado: true });
  });

  it("vínculo que falha apaga o usuário que o convite criou no Auth", async () => {
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

    const r = await criarAcessoCorretor("c1", "ana@gmail.com");

    expect(r.ok).toBe(false);
    expect(usuariosApagados).toEqual(["usuario-novo"]);
    expect(enviados).toEqual([]);
    expect(eventos()).toEqual([]);
  });

  it("convidar não revela o grupo de um e-mail em uso", async () => {
    // Pela conferência global (0192): ocupado em qualquer grupo.
    emailLivre = false;
    const r1 = await criarAcessoCorretor("c1", "beto@gmail.com");
    expect(r1).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    expect(MENSAGEM_EMAIL_EM_USO).toBe("Esse e-mail já tem acesso à plataforma. Use outro.");
    expect(pedidosDeLink).toEqual([]);

    // Pelo Auth: a conferência passou, mas o login já existe.
    emailLivre = true;
    respostaDoLink.invite = { ok: false, motivo: "email_em_uso" };
    const r2 = await criarAcessoCorretor("c1", "beto@gmail.com");
    expect(r2).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });

    for (const r of [r1, r2]) {
      const texto = JSON.stringify(r);
      expect(texto).not.toContain("Lua");
      expect(texto).not.toContain(GRUPO_B);
    }
    expect(corretor("c1").user_id).toBeNull();
  });

  it("convite que volta com o login pendente de outra ficha não vincula nem apaga", async () => {
    /*
     * O Auth reaproveita um usuário que ainda não confirmou o e-mail: um
     * convite pendente de OUTRO grupo volta com o id dele. Se a conferência
     * global falhar (`null`, "não sei"), vincular bateria no `unique` de
     * `user_id`, e a compensação apagaria o login da outra ficha.
     */
    emailLivre = null;
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-b" };

    const r = await criarAcessoCorretor("c1", "beto@gmail.com");

    expect(r).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    expect(usuariosApagados).toEqual([]);
    expect(enviados).toEqual([]);
    expect(corretor("c1").user_id).toBeNull();
    expect(corretor("c2").user_id).toBe("usuario-b");
    expect(eventos()).toEqual([]);
  });

  it("não convida a ficha de outro grupo", async () => {
    const r = await criarAcessoCorretor("c2", "beto2@gmail.com");
    expect(r).toEqual({ ok: false, erro: "Corretor não encontrado." });
    expect(pedidosDeLink).toEqual([]);
  });

  it("registro de auditoria que falha aparece no log, sem o e-mail", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      if (tabela !== "admin_eventos") return original(tabela);
      return { insert: async () => ({ error: { message: "violates check constraint" } }) } as never;
    };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await criarAcessoCorretor("c1", "ana@gmail.com");

    expect(r.ok).toBe(true);
    const logs = erro.mock.calls.map((c) => c.join(" "));
    expect(logs.some((l) => l.includes("violates check constraint"))).toBe(true);
    expect(logs.join(" ")).not.toContain("ana@gmail.com");
  });
});

describe("conta antiga @nexthome.com", () => {
  it("conta @nexthome.com só oferece trocar e-mail", async () => {
    // Conta já usada não troca e-mail pela mão do gestor (ver "conta já usada").
    expect(acoesDeAcesso({ temLogin: true, email: "duda@nexthome.com", convitePendente: false })).toEqual([]);
    expect(acoesDeAcesso({ temLogin: true, email: "DUDA@NEXTHOME.COM", convitePendente: true })).toEqual([
      "trocar_email",
    ]);
    expect(acoesDeAcesso({ temLogin: true, email: "carla@gmail.com", convitePendente: false })).toEqual([
      "link_de_senha",
    ]);
    expect(acoesDeAcesso({ temLogin: true, email: "carla@gmail.com", convitePendente: true })).toEqual([
      "reenviar_convite",
      "trocar_email",
    ]);
    expect(acoesDeAcesso({ temLogin: false, email: null, convitePendente: false })).toEqual(["convidar"]);
    expect(MENSAGEM_ENDERECO_PROVISORIO).toBe(
      "Este acesso usa um endereço provisório. Troque o e-mail para mandar o link.",
    );

    // E as actions recusam, mesmo chamadas por fora da tela.
    usuarioDoAuth = { id: "usuario-4", email: "duda@nexthome.com", last_sign_in_at: null };
    expect(await reenviarConvite("c4")).toEqual({ ok: false, erro: MENSAGEM_ENDERECO_PROVISORIO });
    expect(await enviarLinkDeSenha("c4")).toEqual({ ok: false, erro: MENSAGEM_ENDERECO_PROVISORIO });
    expect(pedidosDeLink).toEqual([]);
  });

  it("não convida para um endereço @nexthome.com", async () => {
    const r = await criarAcessoCorretor("c1", "ana@nexthome.com");
    expect(r.ok).toBe(false);
    expect(pedidosDeLink).toEqual([]);
  });
});

describe("reenviar e mandar link de senha", () => {
  it("reenviar usa invite antes do primeiro login e recovery depois", async () => {
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-1" };

    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: null };
    const antes = await reenviarConvite("c3");
    expect(antes).toEqual({ ok: true, enviado: false, url: URL_CONVITE });
    expect(pedidosDeLink[0]).toEqual(["invite", "carla@gmail.com", "/corretor/definir-senha"]);

    // Depois do primeiro login, o link de senha só vai por e-mail.
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    respostaDoEnvio = { enviado: true, id: "m" };
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: "2026-10-18T12:00:00Z" };
    const depois = await reenviarConvite("c3");
    expect(depois).toEqual({ ok: true, enviado: true });
    expect(pedidosDeLink[1]).toEqual(["recovery", "carla@gmail.com", "/corretor/definir-senha"]);

    expect(eventos().map((e) => e.acao)).toEqual(["convite_reenviado", "convite_reenviado"]);
    expect(eventos().every((e) => e.grupo_id === GRUPO_A && e.alvo_corretor_id === "c3")).toBe(true);
  });

  it("conta confirmada que nunca entrou recebe link de senha quando o convite é recusado", async () => {
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: null };
    respostaDoLink.invite = { ok: false, motivo: "email_em_uso" };
    const r = await reenviarConvite("c3");
    expect(r).toEqual({ ok: true, enviado: false, url: URL_SENHA });
    expect(pedidosDeLink.map((p) => p[0])).toEqual(["invite", "recovery"]);
  });

  it("não reenvia para a ficha de outro grupo", async () => {
    usuarioDoAuth = { id: "usuario-b", email: "beto@gmail.com", last_sign_in_at: null };
    expect(await reenviarConvite("c2")).toEqual({ ok: false, erro: "Corretor não encontrado." });
    expect(await enviarLinkDeSenha("c2")).toEqual({ ok: false, erro: "Corretor não encontrado." });
    expect(pedidosDeLink).toEqual([]);
  });

  it("link de senha manda recovery e registra", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: "2026-10-18T12:00:00Z" };
    respostaDoEnvio = { enviado: true, id: "m" };
    expect(await enviarLinkDeSenha("c3")).toEqual({ ok: true, enviado: true });
    expect(pedidosDeLink).toEqual([["recovery", "carla@gmail.com", "/corretor/definir-senha"]]);
    expect(eventos()[0]).toMatchObject({ acao: "link_de_senha_enviado", alvo_corretor_id: "c3", grupo_id: GRUPO_A });
  });
});

describe("trocar e-mail", () => {
  it("trocar e-mail confere o grupo do corretor", async () => {
    usuarioDoAuth = { id: "usuario-b", email: "beto@gmail.com", last_sign_in_at: null };
    const r = await trocarEmailDoCorretor("c2", "novo@gmail.com");
    expect(r).toEqual({ ok: false, erro: "Corretor não encontrado." });
    expect(trocasNoAuth).toEqual([]);
    expect(corretor("c2").email).toBe("beto@gmail.com");
  });

  it("troca no Auth e na ficha, registra e manda link de senha ao endereço novo", async () => {
    usuarioDoAuth = { id: "usuario-4", email: "duda@nexthome.com", last_sign_in_at: null };
    respostaDoLink.recovery = { ok: true, url: URL_SENHA, userId: "usuario-4" };

    const r = await trocarEmailDoCorretor("c4", " Duda@Gmail.com ");

    expect(r).toEqual({ ok: true, enviado: false, url: URL_SENHA });
    expect(trocasNoAuth).toEqual([{ id: "usuario-4", dados: { email: "duda@gmail.com", email_confirm: true } }]);
    expect(corretor("c4").email).toBe("duda@gmail.com");
    expect(eventos()[0]).toMatchObject({ acao: "email_alterado", alvo_corretor_id: "c4", grupo_id: GRUPO_A });
    expect(pedidosDeLink).toEqual([["recovery", "duda@gmail.com", "/corretor/definir-senha"]]);
  });

  it("e-mail novo em uso tem a frase neutra", async () => {
    usuarioDoAuth = { id: "usuario-4", email: "duda@nexthome.com", last_sign_in_at: null };
    emailLivre = false;
    expect(await trocarEmailDoCorretor("c4", "beto@gmail.com")).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    expect(trocasNoAuth).toEqual([]);

    emailLivre = true;
    erroAoTrocarEmail = { message: "A user with this email address has already been registered", code: "email_exists" };
    expect(await trocarEmailDoCorretor("c4", "beto@gmail.com")).toEqual({ ok: false, erro: MENSAGEM_EMAIL_EM_USO });
    expect(corretor("c4").email).toBe("duda@nexthome.com");
  });

  it("não troca para outro endereço @nexthome.com", async () => {
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: null };
    const r = await trocarEmailDoCorretor("c3", "carla@nexthome.com");
    expect(r.ok).toBe(false);
    expect(trocasNoAuth).toEqual([]);
  });
});

/*
 * A fábrica de credencial derivada acabou. `nome@nexthome.com` é domínio de
 * TERCEIRO, e senha montada com o telefone é senha que qualquer colega
 * adivinha. Esta guarda lê o código (não o executa): a volta seria calada —
 * a tela funciona, o login funciona, e o endereço de um estranho volta a ser
 * o login de alguém da equipe.
 */
describe("guarda de credencial derivada", () => {
  const RAIZ = process.cwd();
  const PERMITIDO = join("src", "lib", "corretores", "credenciaisIniciais.ts");

  function arquivosDe(dir: string): string[] {
    const saida: string[] = [];
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) saida.push(...arquivosDe(caminho));
      else if (/\.(ts|tsx|mjs)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) saida.push(caminho);
    }
    return saida;
  }

  const PROIBIDOS: { nome: string; re: RegExp }[] = [
    { nome: "monta e-mail @nexthome.com", re: /@nexthome\.com(?![.\w])/i },
    { nome: "monta e-mail com o domínio de acesso", re: /@\$\{\s*DOMINIO_ACESSO\s*\}|["'`]@["'`]\s*\+\s*DOMINIO_ACESSO/ },
    { nome: "senha derivada", re: /\b(senhaInicial|senhaTemporaria|PREFIXO_SENHA|DIGITOS_DA_SENHA|emailInicial|candidatosDeEmail)\b/ },
    { nome: "login nascido com senha", re: /\.admin\.createUser\s*\(/ },
    { nome: "senha trocada pelo administrador", re: /updateUserById\([^)]*\bpassword\b/ },
  ];

  it("nenhum arquivo cria e-mail @nexthome.com nem senha derivada", () => {
    const achados: string[] = [];
    for (const arquivo of arquivosDe(join(RAIZ, "src"))) {
      const relativo = arquivo.slice(RAIZ.length + 1);
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      for (const { nome, re } of PROIBIDOS) {
        // O módulo que RECONHECE o endereço antigo pode nomear o domínio.
        if (relativo === PERMITIDO && nome !== "senha derivada" && nome !== "login nascido com senha") continue;
        if (re.test(codigo)) achados.push(`${relativo}: ${nome}`);
      }
    }
    expect(
      achados,
      "Voltou a fábrica de credencial derivada. O acesso nasce por convite no e-mail real " +
        "(src/lib/corretores/convite.ts); o endereço @nexthome.com é de terceiro.",
    ).toEqual([]);
  });

  it("o módulo de credenciais só reconhece o endereço antigo, não o fabrica", async () => {
    const modulo = await import("@/lib/corretores/credenciaisIniciais");
    expect(Object.keys(modulo).sort()).toEqual(["ehEmailDeAcesso", "normalizarParaEmail"]);
  });
});

/*
 * O gestor não assume o login de ninguém (revisão da fase 2A). Tomar o login
 * de alguém é o jeito de ler as conversas dele, e nem gestor nem
 * administrador da plataforma lê conversa de outro.
 */
describe("o gestor não assume login alheio", () => {
  beforeEach(() => {
    banco.tabelas.corretores.push(
      { id: "c5", nome: "Edu Gestor", slug: "edu", user_id: "usuario-5", email: "edu@gmail.com", papel: "gestor", grupo_id: GRUPO_A },
      { id: "gestor-a", nome: "Eu Gestor", slug: "eu", user_id: "usuario-eu", email: "eu@gmail.com", papel: "gestor", grupo_id: GRUPO_A },
    );
  });

  it("recusa outro gestor nas três ações, sem gerar link nem trocar e-mail", async () => {
    usuarioDoAuth = { id: "usuario-5", email: "edu@gmail.com", last_sign_in_at: null };
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-5" };
    expect(await reenviarConvite("c5")).toEqual({ ok: false, erro: MENSAGEM_OUTRO_GESTOR });
    expect(await enviarLinkDeSenha("c5")).toEqual({ ok: false, erro: MENSAGEM_OUTRO_GESTOR });
    expect(await trocarEmailDoCorretor("c5", "meu@gmail.com")).toEqual({ ok: false, erro: MENSAGEM_OUTRO_GESTOR });
    expect(pedidosDeLink).toEqual([]);
    expect(trocasNoAuth).toEqual([]);
    expect(acoesDeAcesso({ temLogin: true, email: "edu@gmail.com", convitePendente: true, outroGestor: true })).toEqual([]);
  });

  it("recusa quem administra a plataforma", async () => {
    banco.tabelas.administradores_da_plataforma = [{ user_id: "usuario-1" }];
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: null };
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-1" };
    expect(await reenviarConvite("c3")).toEqual({ ok: false, erro: MENSAGEM_ADMIN_DA_PLATAFORMA });
    expect(await enviarLinkDeSenha("c3")).toEqual({ ok: false, erro: MENSAGEM_ADMIN_DA_PLATAFORMA });
    expect(await trocarEmailDoCorretor("c3", "outra@gmail.com")).toEqual({ ok: false, erro: MENSAGEM_ADMIN_DA_PLATAFORMA });
    expect(pedidosDeLink).toEqual([]);
    expect(trocasNoAuth).toEqual([]);
  });

  it("o gestor manda o próprio link de senha (pelo e-mail dele)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    respostaDoEnvio = { enviado: true, id: "m" };
    usuarioDoAuth = { id: "usuario-eu", email: "eu@gmail.com", last_sign_in_at: "2026-10-18T12:00:00Z" };
    respostaDoLink.recovery = { ok: true, url: URL_SENHA, userId: "usuario-eu" };
    expect(await enviarLinkDeSenha("gestor-a")).toEqual({ ok: true, enviado: true });
  });

  it("conta já usada: sem e-mail configurado, recusa e nem gera o link", async () => {
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: "2026-10-18T12:00:00Z" };
    const r1 = await enviarLinkDeSenha("c3");
    const r2 = await reenviarConvite("c3");
    expect(r1).toEqual({ ok: false, erro: MENSAGEM_SEM_EMAIL_CONFIGURADO });
    expect(r2).toEqual({ ok: false, erro: MENSAGEM_SEM_EMAIL_CONFIGURADO });
    expect(pedidosDeLink).toEqual([]);
    expect(JSON.stringify([r1, r2])).not.toContain("token_hash");
  });

  it("conta já usada: e-mail recusado é erro, e o link nunca volta para a tela", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    respostaDoEnvio = { enviado: false, motivo: "recusado" };
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: "2026-10-18T12:00:00Z" };
    const r = await enviarLinkDeSenha("c3");
    expect(r).toEqual({ ok: false, erro: MENSAGEM_EMAIL_NAO_SAIU });
    expect(JSON.stringify(r)).not.toContain(URL_SENHA);
    expect(enviados.map((e) => e[1])).toEqual(["carla@gmail.com"]);
  });

  it("conta já usada não troca de e-mail", async () => {
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: "2026-10-18T12:00:00Z" };
    expect(await trocarEmailDoCorretor("c3", "gestor@gmail.com")).toEqual({
      ok: false,
      erro: MENSAGEM_EMAIL_DE_CONTA_USADA,
    });
    expect(trocasNoAuth).toEqual([]);
    expect(pedidosDeLink).toEqual([]);
    expect(corretor("c3").email).toBe("carla@gmail.com");
  });

  it("conta que nunca entrou: o link do convite ainda pode ir para a tela", async () => {
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-1" };
    usuarioDoAuth = { id: "usuario-1", email: "carla@gmail.com", last_sign_in_at: null };
    expect(await reenviarConvite("c3")).toEqual({ ok: true, enviado: false, url: URL_CONVITE });
  });

  it("sem conseguir ler o Auth, recusa (não trata como conta nunca usada)", async () => {
    erroDoAuth = { message: "timeout" };
    respostaDoLink.invite = { ok: true, url: URL_CONVITE, userId: "usuario-1" };
    const r = await reenviarConvite("c3");
    expect(r.ok).toBe(false);
    expect(pedidosDeLink).toEqual([]);
    expect(await trocarEmailDoCorretor("c3", "x@gmail.com")).toMatchObject({ ok: false });
    expect(trocasNoAuth).toEqual([]);
  });
});

/*
 * A compensação do convite não apaga login que tem ficha (revisão da fase
 * 2A, a regra de `apagarLoginSemFicha` da plataforma). O vínculo pode gravar
 * e só a resposta se perder: apagar o login aí deixaria a ficha apontando
 * para um usuário que não existe.
 */
describe("compensação do convite", () => {
  /** Faz o update de `corretores` devolver erro; `aplica` decide se ele gravou mesmo assim. */
  function vinculoQueFalha({ aplica, recontagemFalha = false, apagarFalha = false }: { aplica: boolean; recontagemFalha?: boolean; apagarFalha?: boolean }) {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "corretores") return q;
      const select = q.select;
      q.select = ((colunas?: string, opcoes?: { head?: boolean }) => {
        if (recontagemFalha && opcoes?.head) return { eq: async () => ({ count: null, error: { message: "timeout" } }) } as never;
        return select(colunas, opcoes);
      }) as never;
      if (apagarFalha) q.delete = (() => ({ eq: () => ({ eq: async () => ({ error: { message: "violates foreign key" } }) }) })) as never;
      q.update = ((valores: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          eq: () => ({
            select: async () => {
              if (aplica) Object.assign(banco.tabelas.corretores.find((c) => c.id === id)!, valores);
              return { data: null, error: { message: "fetch failed" } };
            },
          }),
        }),
      })) as never;
      return q;
    };
  }

  it("vínculo que gravou e só perdeu a resposta não apaga o login", async () => {
    vinculoQueFalha({ aplica: true });
    const r = await criarAcessoCorretor("c1", "ana@gmail.com");
    expect(r.ok).toBe(false);
    expect(usuariosApagados).toEqual([]);
    expect(corretor("c1").user_id).toBe("usuario-novo");
  });

  it("sem conseguir reconferir, mantém o login e devolve-o para quem chama decidir", async () => {
    vinculoQueFalha({ aplica: false, recontagemFalha: true });
    const r = await criarAcessoCorretor("c1", "ana@gmail.com");
    expect(r).toMatchObject({ ok: false, loginNaoConferido: "usuario-novo" });
    expect(usuariosApagados).toEqual([]);
  });

  it("cadastrar desfaz a ficha e, depois dela, o login que era só dela", async () => {
    vinculoQueFalha({ aplica: true });
    const r = await cadastrarCorretor({ nome: "Nina Nova", creci: "12345", whatsapp: "11987654321", email: "nina@gmail.com" });
    expect(r.ok).toBe(false);
    expect(banco.tabelas.corretores.some((c) => c.nome === "Nina Nova")).toBe(false);
    expect(usuariosApagados).toEqual(["usuario-novo"]);
  });

  it("cadastrar: a ficha que não sai é dita na tela, e o login dela fica", async () => {
    vinculoQueFalha({ aplica: true, apagarFalha: true });
    const r = await cadastrarCorretor({ nome: "Nina Nova", creci: "12345", whatsapp: "11987654321", email: "nina@gmail.com" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/ficou na lista sem acesso/);
    expect(usuariosApagados).toEqual([]);
  });
});
