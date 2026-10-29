import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A equipe de qualquer grupo pela plataforma (29/10/2026): desativar,
 * reativar e trocar o papel de um acesso.
 *
 * O que se prova: a guarda vem antes do banco, tudo fica no grupo da página
 * (o mesmo id de corretor, pedido por outro grupo, não é achado), o grupo
 * nunca fica sem gestor ativo, a plataforma só CONTA leads e o rastro em
 * `admin_eventos` leva `origem: 'plataforma'`. O gatilho real
 * (`garantir_gestor_remanescente`, 0192) é a rede de baixo; aqui ele é
 * simulado só para ver a frase que a tela recebe.
 */

const OPERADOR = "operador-1";
const G1 = "00000000-0000-4000-8000-0000000000a1";
const G2 = "00000000-0000-4000-8000-0000000000a2";
const ANA = "00000000-0000-4000-8000-0000000000c1"; // gestora de G1
const BETO = "00000000-0000-4000-8000-0000000000c2"; // corretor de G1
const CAIO = "00000000-0000-4000-8000-0000000000c3"; // gestor de G2

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/catalogo/revalidar", () => ({ revalidarCorretores: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { alterarPapelDoAcesso, alternarAtivoDoAcesso } = await import("./equipeAcoes");

const NEGADO = "Esta ação é restrita a quem administra a plataforma.";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { userId: OPERADOR };
  banco = bancoFalso({
    corretores: [
      { id: ANA, nome: "Ana", papel: "gestor", ativo: true, grupo_id: G1 },
      { id: BETO, nome: "Beto", papel: "corretor", ativo: true, grupo_id: G1 },
      { id: CAIO, nome: "Caio", papel: "gestor", ativo: true, grupo_id: G2 },
    ],
    leads: [
      { id: "l1", corretor_id: BETO, grupo_id: G1 },
      { id: "l2", corretor_id: BETO, grupo_id: G1 },
      { id: "l3", corretor_id: ANA, grupo_id: G1 },
    ],
    admin_eventos: [],
  });
});

const ficha = (id: string) => banco.tabelas.corretores.find((c) => c.id === id)!;

describe("desativar e reativar um acesso", () => {
  it("desativa o corretor do grupo, conta a carteira (sem ler lead) e deixa o evento da plataforma", async () => {
    const r = await alternarAtivoDoAcesso(G1, BETO, false);
    expect(r).toEqual({ ok: true, mensagem: expect.stringMatching(/Beto foi desativado/), leadsNaCarteira: 2 });
    expect(ficha(BETO).ativo).toBe(false);
    expect(banco.tabelas.admin_eventos).toEqual([
      {
        id: expect.any(String),
        grupo_id: G1,
        ator_id: null,
        ator_plataforma_user_id: OPERADOR,
        acao: "corretor_desativado",
        alvo_corretor_id: BETO,
        detalhes: { origem: "plataforma" },
      },
    ]);
    // `leads` só com head: true (contagem), e sempre filtrando o grupo.
    const deLeads = banco.consultas.filter((c) => c.tabela === "leads");
    expect(deLeads).toHaveLength(1);
    expect(deLeads[0].operacao).toBe("select");
    expect(deLeads[0].filtros).toContain("eq:grupo_id");
  });

  it("reativa quem estava desativado", async () => {
    ficha(BETO).ativo = false;
    expect(await alternarAtivoDoAcesso(G1, BETO, true)).toEqual({ ok: true, mensagem: expect.stringMatching(/reativado/) });
    expect(ficha(BETO).ativo).toBe(true);
    expect(banco.tabelas.admin_eventos.map((e) => e.acao)).toEqual(["corretor_reativado"]);
  });

  it("recusa desativar o último gestor ativo, sem escrever", async () => {
    const r = await alternarAtivoDoAcesso(G1, ANA, false);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/sem nenhum administrador/) });
    expect(ficha(ANA).ativo).toBe(true);
    expect(banco.consultas.some((c) => c.operacao === "update")).toBe(false);
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("desativa um gestor quando há outro gestor ATIVO no mesmo grupo (o de outro grupo não conta)", async () => {
    // Caio é gestor ativo, mas de G2: não salva Ana.
    expect((await alternarAtivoDoAcesso(G1, ANA, false)).ok).toBe(false);
    ficha(BETO).papel = "gestor";
    expect((await alternarAtivoDoAcesso(G1, ANA, false)).ok).toBe(true);
    expect(ficha(ANA).ativo).toBe(false);
  });

  it("gestor desativado não conta como gestor que sobra", async () => {
    banco.tabelas.corretores.push({ id: "00000000-0000-4000-8000-0000000000c9", nome: "Dani", papel: "gestor", ativo: false, grupo_id: G1 });
    expect((await alternarAtivoDoAcesso(G1, ANA, false)).ok).toBe(false);
  });

  it("o id de outro grupo não é achado pela página deste grupo", async () => {
    expect(await alternarAtivoDoAcesso(G1, CAIO, false)).toEqual({ ok: false, erro: "Acesso não encontrado." });
    expect(ficha(CAIO).ativo).toBe(true);
    for (const c of banco.consultas.filter((c) => c.tabela === "corretores")) expect(c.filtros).toContain("eq:grupo_id");
  });

  it("já no estado pedido: recusa sem evento", async () => {
    expect((await alternarAtivoDoAcesso(G1, BETO, true)).ok).toBe(false);
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("o gatilho do banco recusando vira a mesma frase", async () => {
    ficha(BETO).papel = "gestor";
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "corretores") return q;
      return {
        ...q,
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => ({ data: null, error: { message: "A imobiliária ficaria sem nenhum gestor ativo." } }),
            }),
          }),
        }),
      } as unknown as typeof q;
    };
    expect(await alternarAtivoDoAcesso(G1, ANA, false)).toEqual({ ok: false, erro: expect.stringMatching(/Promova outro/) });
  });
});

describe("trocar o papel de um acesso", () => {
  it("promove o corretor a gestor no grupo da página, com o evento do papel", async () => {
    expect(await alterarPapelDoAcesso(G1, BETO, "gestor")).toEqual({ ok: true, mensagem: expect.stringMatching(/administra/) });
    expect(ficha(BETO).papel).toBe("gestor");
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: G1,
        acao: "papel_alterado",
        ator_plataforma_user_id: OPERADOR,
        alvo_corretor_id: BETO,
        detalhes: { origem: "plataforma", papel: "gestor", antes: "corretor" },
      }),
    ]);
  });

  it("recusa tirar o último gestor ativo da administração", async () => {
    expect(await alterarPapelDoAcesso(G1, ANA, "corretor")).toEqual({ ok: false, erro: expect.stringMatching(/sem nenhum administrador/) });
    expect(ficha(ANA).papel).toBe("gestor");
  });

  it("com outro gestor ativo, a gestora volta a corretora", async () => {
    await alterarPapelDoAcesso(G1, BETO, "gestor");
    expect((await alterarPapelDoAcesso(G1, ANA, "corretor")).ok).toBe(true);
    expect(ficha(ANA).papel).toBe("corretor");
  });

  it("papel inválido, id torto e corretor de outro grupo não escrevem", async () => {
    expect((await alterarPapelDoAcesso(G1, BETO, "dono" as "gestor")).ok).toBe(false);
    expect((await alterarPapelDoAcesso("g1; drop", BETO, "gestor")).ok).toBe(false);
    expect(await alterarPapelDoAcesso(G2, BETO, "gestor")).toEqual({ ok: false, erro: "Acesso não encontrado." });
    expect(ficha(BETO).papel).toBe("corretor");
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });
});

describe("quem não administra a plataforma", () => {
  it("não desativa, não reativa e não troca papel: o banco nem é tocado", async () => {
    guarda = { erro: NEGADO };
    expect(await alternarAtivoDoAcesso(G1, BETO, false)).toEqual({ ok: false, erro: NEGADO });
    expect(await alternarAtivoDoAcesso(G1, BETO, true)).toEqual({ ok: false, erro: NEGADO });
    expect(await alterarPapelDoAcesso(G1, BETO, "gestor")).toEqual({ ok: false, erro: NEGADO });
    expect(banco.consultas).toEqual([]);
  });
});
