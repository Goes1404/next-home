import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * Pôr e tirar administradores da plataforma (29/10/2026).
 *
 * O que se prova: a guarda vem antes do banco e do Auth; login que existe
 * entra sem senha nenhuma; login que não existe só nasce depois da pergunta
 * (`criarConta`) e com senha dentro da régua, marcado para trocar no
 * primeiro login; ninguém tira a si mesmo; a plataforma nunca fica sem
 * administrador, nem com dois tirando um ao outro ao mesmo tempo.
 */

const EU = "00000000-0000-4000-8000-000000000001";
const OUTRO = "00000000-0000-4000-8000-000000000002";
const SEM_PAPEL = "00000000-0000-4000-8000-000000000003";
const NEGADO = "Esta ação é restrita a quem administra a plataforma.";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };
let usuarios: { id: string; email: string }[];
let criados: Record<string, unknown>[];
let apagados: string[];
let paginasLidas: number[];

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { adicionarAdministrador, removerAdministrador } = await import("./administradoresAcoes");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { userId: EU };
  usuarios = [
    { id: EU, email: "eu@astro.com" },
    { id: OUTRO, email: "outro@astro.com" },
    { id: SEM_PAPEL, email: "Gestora@Silva.com" },
  ];
  criados = [];
  apagados = [];
  paginasLidas = [];
  banco = bancoFalso({
    administradores_da_plataforma: [
      { user_id: EU, criado_em: "2026-10-01T00:00:00Z" },
      { user_id: OUTRO, criado_em: "2026-10-02T00:00:00Z" },
    ],
    admin_eventos: [],
  });
  banco.cliente.auth = {
    admin: {
      listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
        paginasLidas.push(page);
        return { data: { users: usuarios.slice((page - 1) * perPage, page * perPage) }, error: null };
      },
      createUser: async (atributos: Record<string, unknown>) => {
        criados.push(atributos);
        const user = { id: "00000000-0000-4000-8000-0000000000ee", email: atributos.email };
        return { data: { user }, error: null };
      },
      deleteUser: async (id: string) => {
        apagados.push(id);
        return { data: {}, error: null };
      },
    },
  };
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}
const admins = () => banco.tabelas.administradores_da_plataforma.map((a) => a.user_id);

describe("adicionar administrador", () => {
  it("login que já existe entra pelo e-mail, sem diferença de maiúsculas e sem senha", async () => {
    const r = await adicionarAdministrador(undefined, form({ email: "  gestora@silva.COM " }));
    expect(r).toEqual({ ok: true, email: "gestora@silva.com", contaCriada: false });
    expect(admins()).toContain(SEM_PAPEL);
    expect(criados).toEqual([]);
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: null,
        alvo_corretor_id: null,
        ator_plataforma_user_id: EU,
        acao: "admin_da_plataforma_adicionado",
        detalhes: { origem: "plataforma", user_id: SEM_PAPEL, conta_criada: false },
      }),
    ]);
  });

  it("quem já administra não entra duas vezes", async () => {
    const r = await adicionarAdministrador(undefined, form({ email: "outro@astro.com" }));
    expect(r).toEqual({ ok: false, erro: "Este login já administra a plataforma." });
    expect(admins()).toEqual([EU, OUTRO]);
  });

  it("e-mail sem login: primeiro pergunta, não cria nada", async () => {
    const r = await adicionarAdministrador(undefined, form({ email: "nova@astro.com", senha: "Forte#2026x" }));
    expect(r).toMatchObject({ ok: false, semConta: true, email: "nova@astro.com" });
    expect(criados).toEqual([]);
    expect(admins()).toEqual([EU, OUTRO]);
  });

  it("criando o login: a senha passa pela régua, e a conta nasce marcada para trocar", async () => {
    const fraca = await adicionarAdministrador(undefined, form({ email: "nova@astro.com", criarConta: "1", senha: "fraca1234" }));
    expect(fraca).toMatchObject({ ok: false, semConta: true, erro: expect.stringMatching(/^A senha precisa de: /) });
    expect(criados).toEqual([]);

    const r = await adicionarAdministrador(undefined, form({ email: "nova@astro.com", criarConta: "1", senha: "Forte#2026x" }));
    expect(r).toEqual({ ok: true, email: "nova@astro.com", contaCriada: true });
    expect(criados).toEqual([
      { email: "nova@astro.com", password: "Forte#2026x", email_confirm: true, app_metadata: { deve_trocar_senha: true } },
    ]);
    expect(admins()).toContain("00000000-0000-4000-8000-0000000000ee");
    // A senha só vai ao Auth.
    expect(JSON.stringify(banco.tabelas)).not.toContain("Forte#2026x");
  });

  it("login criado sem conseguir o papel é apagado", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "administradores_da_plataforma") return q;
      return { ...q, insert: () => Promise.resolve({ data: null, error: { message: "boom" } }) } as unknown as typeof q;
    };
    const r = await adicionarAdministrador(undefined, form({ email: "nova@astro.com", criarConta: "1", senha: "Forte#2026x" }));
    expect(r.ok).toBe(false);
    expect(apagados).toEqual(["00000000-0000-4000-8000-0000000000ee"]);
  });

  it("procura em todas as páginas do Auth antes de dizer que não existe", async () => {
    usuarios = [
      ...Array.from({ length: 1000 }, (_, i) => ({ id: `u-${i}`, email: `u${i}@x.com` })),
      { id: SEM_PAPEL, email: "gestora@silva.com" },
    ];
    expect((await adicionarAdministrador(undefined, form({ email: "gestora@silva.com" }))).ok).toBe(true);
    expect(paginasLidas).toEqual([1, 2]);
  });

  it("e-mail inválido e quem não administra não chegam ao Auth nem ao banco", async () => {
    expect((await adicionarAdministrador(undefined, form({ email: "sem-arroba" }))).ok).toBe(false);
    guarda = { erro: NEGADO };
    expect(await adicionarAdministrador(undefined, form({ email: "gestora@silva.com" }))).toEqual({ ok: false, erro: NEGADO });
    expect(paginasLidas).toEqual([]);
    expect(banco.consultas).toEqual([]);
  });
});

describe("remover administrador", () => {
  it("tira outro administrador e deixa o evento da plataforma", async () => {
    expect(await removerAdministrador(OUTRO)).toEqual({ ok: true });
    expect(admins()).toEqual([EU]);
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: null,
        alvo_corretor_id: null,
        acao: "admin_da_plataforma_removido",
        detalhes: { origem: "plataforma", user_id: OUTRO },
      }),
    ]);
  });

  it("ninguém tira a si mesmo", async () => {
    expect(await removerAdministrador(EU)).toEqual({ ok: false, erro: expect.stringMatching(/próprio acesso/) });
    expect(admins()).toEqual([EU, OUTRO]);
    expect(banco.consultas).toEqual([]);
  });

  it("a plataforma não fica sem administrador", async () => {
    // Outro administrador (que eu sou na sessão) tentando tirar o único que sobrou na tabela.
    banco.tabelas.administradores_da_plataforma = [{ user_id: OUTRO }];
    expect(await removerAdministrador(OUTRO)).toEqual({ ok: false, erro: "A plataforma não pode ficar sem administrador." });
    expect(admins()).toEqual([OUTRO]);
  });

  it("dois tirando um ao outro ao mesmo tempo: quem acha zero depois devolve o seu", async () => {
    // Simula a outra sessão: entre a conferência e o delete, ela tirou EU.
    const original = banco.cliente.from;
    let deletes = 0;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "administradores_da_plataforma") return q;
      return {
        ...q,
        delete: () => {
          deletes++;
          banco.tabelas.administradores_da_plataforma = banco.tabelas.administradores_da_plataforma.filter((a) => a.user_id !== EU);
          return q.delete();
        },
      } as unknown as typeof q;
    };
    expect(await removerAdministrador(OUTRO)).toEqual({ ok: false, erro: "A plataforma não pode ficar sem administrador." });
    expect(deletes).toBe(1);
    expect(admins()).toEqual([OUTRO]);
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("id torto, login que não administra e quem não administra não tiram ninguém", async () => {
    expect((await removerAdministrador("x; drop")).ok).toBe(false);
    expect(await removerAdministrador(SEM_PAPEL)).toEqual({ ok: false, erro: "Administrador não encontrado." });
    guarda = { erro: NEGADO };
    expect(await removerAdministrador(OUTRO)).toEqual({ ok: false, erro: NEGADO });
    expect(admins()).toEqual([EU, OUTRO]);
  });
});
