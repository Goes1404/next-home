import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../test/bancoFalso";

/**
 * O suporte da Astro pelo painel (0240, 29/10/2026): quem é e de onde vem
 * saem da SESSÃO, nunca do formulário; sem sessão nada grava e a chave nem
 * existe; o limite por hora segura a repetição; o aviso aos administradores
 * leva o nome da conta, o assunto e o começo da mensagem, e nada da carteira.
 * A lista do painel mostra só os chamados do próprio corretor.
 */

const ANA = { id: "c-ana", nome: "Ana Corretora", grupoId: "g-sol" };
const BRUNO = { id: "c-bruno", nome: "Bruno", grupoId: "g-sol" };

let banco: BancoFalso;
let sessao: typeof ANA | null;
let usuario: { email?: string } | null;
let chavesCriadas: number;
let avisos: { titulo: string; corpo: string; url: string }[];

vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado: async () => sessao }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario } }) } }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    chavesCriadas++;
    return banco.cliente;
  },
}));
vi.mock("@/lib/notificacoes/avisosDaPlataforma", () => ({
  avisarAtendimento: (n: { titulo: string; corpo: string; url: string }) => avisos.push(n),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { abrirChamado } = await import("./acoes");
const { listarMeusChamados } = await import("./meusChamados");

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const chamados = () => banco.tabelas.chamados_de_suporte;

beforeEach(() => {
  sessao = ANA;
  usuario = { email: "ana@sol.com.br" };
  chavesCriadas = 0;
  avisos = [];
  banco = bancoFalso({
    chamados_de_suporte: [],
    grupos: [
      { id: "g-sol", nome: "Imob Sol" },
      { id: "g-outra", nome: "Outra Imob" },
    ],
  });
});

describe("abrirChamado", () => {
  it("grava com nome, e-mail, grupo e ficha da sessão, e avisa os administradores", async () => {
    const r = await abrirChamado(undefined, form({ assunto: "problema", mensagem: "A agenda não carrega desde ontem à noite." }));
    expect(r).toEqual({ ok: true });
    expect(chamados()).toHaveLength(1);
    const { id: _id, criado_em, ...linha } = chamados()[0];
    expect(Number.isNaN(Date.parse(String(criado_em)))).toBe(false);
    expect(linha).toEqual({
      origem: "painel",
      assunto: "problema",
      mensagem: "A agenda não carrega desde ontem à noite.",
      nome: "Ana Corretora",
      email: "ana@sol.com.br",
      whatsapp: null,
      grupo_origem_id: "g-sol",
      corretor_origem_id: "c-ana",
    });
    expect(avisos).toEqual([
      {
        titulo: "Suporte: Imob Sol",
        corpo: "Algo não funciona · A agenda não carrega desde ontem à noite.",
        url: "/plataforma/suporte",
        tag: expect.stringMatching(/^suporte-c-ana-/),
      },
    ]);
  });

  it("campos de identidade vindos do formulário são ignorados", async () => {
    await abrirChamado(
      undefined,
      form({
        assunto: "duvida",
        mensagem: "Como troco a foto do perfil?",
        nome: "Outro",
        email: "x@x.com",
        grupo_origem_id: "g-outra",
        corretor_origem_id: "c-bruno",
      }),
    );
    expect(chamados()[0]).toMatchObject({ nome: "Ana Corretora", grupo_origem_id: "g-sol", corretor_origem_id: "c-ana" });
    expect(avisos[0].titulo).toBe("Suporte: Imob Sol");
  });

  it("sem sessão nada grava e a chave nem é criada", async () => {
    sessao = null;
    const r = await abrirChamado(undefined, form({ assunto: "duvida", mensagem: "Uma dúvida qualquer" }));
    expect(r).toMatchObject({ ok: false });
    expect(chavesCriadas).toBe(0);
    expect(chamados()).toHaveLength(0);
  });

  it("sessão do Auth vencida também barra antes da chave", async () => {
    usuario = null;
    const r = await abrirChamado(undefined, form({ assunto: "duvida", mensagem: "Uma dúvida qualquer" }));
    expect(r).toMatchObject({ ok: false });
    expect(chavesCriadas).toBe(0);
  });

  it("assunto desconhecido ou mensagem curta voltam com o erro do campo", async () => {
    const r = await abrirChamado(undefined, form({ assunto: "spam", mensagem: "oi" }));
    expect(r).toMatchObject({ ok: false, erros: { assunto: expect.any(String), mensagem: expect.any(String) } });
    expect(chavesCriadas).toBe(0);
  });

  it("limite: o sexto chamado na mesma hora é recusado", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await abrirChamado(undefined, form({ assunto: "duvida", mensagem: `Dúvida número ${i}` }))).toEqual({ ok: true });
    }
    const r = await abrirChamado(undefined, form({ assunto: "duvida", mensagem: "Mais uma dúvida" }));
    expect(r).toMatchObject({ ok: false });
    expect(chamados()).toHaveLength(5);
    expect(avisos).toHaveLength(5);
  });

  it("o limite é de cada pessoa: o colega ainda consegue abrir", async () => {
    for (let i = 0; i < 5; i++) await abrirChamado(undefined, form({ assunto: "duvida", mensagem: `Dúvida número ${i}` }));
    sessao = BRUNO;
    expect(await abrirChamado(undefined, form({ assunto: "duvida", mensagem: "A minha dúvida" }))).toEqual({ ok: true });
  });
});

describe("listarMeusChamados", () => {
  it("o corretor só vê os chamados que ele abriu (nem os do colega do mesmo grupo)", async () => {
    banco.tabelas.chamados_de_suporte = [
      { id: "1", corretor_origem_id: "c-ana", grupo_origem_id: "g-sol", assunto: "duvida", mensagem: "minha", status: "novo" },
      { id: "2", corretor_origem_id: "c-bruno", grupo_origem_id: "g-sol", assunto: "duvida", mensagem: "do colega", status: "novo" },
      { id: "3", corretor_origem_id: null, grupo_origem_id: null, origem: "site", assunto: "comercial", mensagem: "do site", status: "novo" },
    ];
    const lista = await listarMeusChamados();
    expect(lista.map((c) => c.id)).toEqual(["1"]);
    expect(banco.consultas.at(-1)?.filtros).toContain("eq:corretor_origem_id");
  });

  it("sem sessão devolve vazio sem criar a chave", async () => {
    sessao = null;
    expect(await listarMeusChamados()).toEqual([]);
    expect(chavesCriadas).toBe(0);
  });
});
