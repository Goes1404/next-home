import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * O registro do acesso à visão de suporte (0243, 29/10/2026): a guarda vem
 * antes da chave; o acesso é gravado em `acessos_de_suporte` E em
 * `admin_eventos` antes do redirecionamento; sem registro, sem tela.
 */

const GRUPO = "00000000-0000-4000-8000-0000000000a1";
const OUTRO = "00000000-0000-4000-8000-0000000000b2";
const NEGADO = "Esta ação é restrita a quem administra a plataforma.";

let banco: BancoFalso;
let guarda: { userId: string } | { erro: string };
let chavesCriadas: number;

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => guarda }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    chavesCriadas++;
    return banco.cliente;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { abrirVisaoDeSuporte } = await import("./visaoDeSuporteAcoes");

function form(motivo?: string): FormData {
  const f = new FormData();
  if (motivo !== undefined) f.set("motivo", motivo);
  return f;
}

/** Roda a action e devolve o destino do redirecionamento (ou o resultado). */
async function abrir(grupoId: string, motivo?: string): Promise<{ destino?: string; resultado?: unknown }> {
  try {
    return { resultado: await abrirVisaoDeSuporte(grupoId, undefined, form(motivo)) };
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (!destino) throw e;
    return { destino };
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  guarda = { userId: "u-admin" };
  chavesCriadas = 0;
  banco = bancoFalso({ grupos: [{ id: GRUPO }, { id: OUTRO }], acessos_de_suporte: [], admin_eventos: [] });
});

describe("abrirVisaoDeSuporte", () => {
  it("quem não administra a plataforma é barrado antes de a chave existir", async () => {
    guarda = { erro: NEGADO };
    expect(await abrir(GRUPO)).toEqual({ resultado: { ok: false, erro: NEGADO } });
    expect(chavesCriadas).toBe(0);
    expect(banco.tabelas.acessos_de_suporte).toEqual([]);
  });

  it("registra o acesso (motivo padrão) e o evento do grupo, e só então abre a tela", async () => {
    const { destino } = await abrir(GRUPO);
    const [acesso] = banco.tabelas.acessos_de_suporte;
    expect(acesso).toMatchObject({ admin_user_id: "u-admin", grupo_alvo_id: GRUPO, motivo: "Atendimento de suporte" });
    expect(destino).toBe(`/plataforma/grupos/${GRUPO}/suporte?acesso=${acesso.id}`);
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: GRUPO,
        acao: "visao_de_suporte_aberta",
        ator_plataforma_user_id: "u-admin",
        detalhes: { origem: "plataforma", acesso_id: acesso.id, motivo: "Atendimento de suporte" },
      }),
    ]);
  });

  it("guarda o motivo digitado, aparado; recusa motivo longo demais sem gravar", async () => {
    await abrir(GRUPO, "  cliente   ligou: IA muda  ");
    expect(banco.tabelas.acessos_de_suporte[0].motivo).toBe("cliente ligou: IA muda");
    banco.tabelas.acessos_de_suporte.length = 0;
    expect((await abrir(GRUPO, "a".repeat(201))).resultado).toMatchObject({ ok: false });
    expect(banco.tabelas.acessos_de_suporte).toEqual([]);
  });

  it("id inválido não chega ao banco; grupo inexistente não registra", async () => {
    expect((await abrir("1; drop table")).resultado).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect(chavesCriadas).toBe(0);
    expect((await abrir("00000000-0000-4000-8000-0000000000ff")).resultado).toEqual({ ok: false, erro: "Grupo não encontrado." });
    expect(banco.tabelas.acessos_de_suporte).toEqual([]);
  });

  it("sem o registro (insert recusado), a tela não abre", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = ((tabela: string) => {
      const q = original(tabela);
      if (tabela !== "acessos_de_suporte") return q;
      return { ...q, insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "recusado" } }) }) }) };
    }) as typeof banco.cliente.from;
    const r = await abrir(GRUPO);
    expect(r.destino).toBeUndefined();
    expect(r.resultado).toMatchObject({ ok: false });
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("o evento recusado (antes da 0243) só vai ao log: o acesso já está registrado", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = ((tabela: string) => {
      const q = original(tabela);
      if (tabela !== "admin_eventos") return q;
      return { ...q, insert: async () => ({ error: { message: "admin_eventos_acao_check" } }) };
    }) as typeof banco.cliente.from;
    const { destino } = await abrir(GRUPO);
    expect(destino).toContain("/suporte?acesso=");
    expect(banco.tabelas.acessos_de_suporte).toHaveLength(1);
  });
});
