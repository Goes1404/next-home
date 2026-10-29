import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * Publicar e encerrar avisos aos clientes (0242, 29/10/2026): a guarda da
 * plataforma vem antes do banco (a chave nem é criada para quem não
 * administra), e a validação recusa sem gravar.
 */

const AVISO = "00000000-0000-4000-8000-0000000000a1";
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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { encerrarAviso, publicarAviso } = await import("./avisosAosClientesAcoes");

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const VALIDO = { titulo: "Manutenção sábado", texto: "O painel fica fora do ar das 2h às 3h.", tipo: "manutencao" };

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  guarda = { userId: "u-admin" };
  chavesCriadas = 0;
  banco = bancoFalso({ avisos_aos_clientes: [{ id: AVISO, titulo: "x", encerrado_em: null }] });
});

describe("publicarAviso", () => {
  it("quem não administra a plataforma é barrado antes de a chave existir", async () => {
    guarda = { erro: NEGADO };
    expect(await publicarAviso(undefined, form(VALIDO))).toEqual({ ok: false, erro: NEGADO });
    expect(chavesCriadas).toBe(0);
    expect(banco.tabelas.avisos_aos_clientes).toHaveLength(1);
  });

  it("publica com quem escreveu e o público padrão; sem início, o banco põe agora", async () => {
    const r = await publicarAviso(undefined, form({ ...VALIDO, link: "/corretor/suporte" }));
    expect(r).toMatchObject({ ok: true });
    const nova = banco.tabelas.avisos_aos_clientes[1];
    expect(nova).toMatchObject({ ...VALIDO, link: "/corretor/suporte", publico: "todos", criado_por: "u-admin", fim_em: null });
    expect(nova).not.toHaveProperty("inicio_em");
  });

  it("validação ruim não cria a chave nem grava", async () => {
    for (const campos of [
      { ...VALIDO, titulo: "a" },
      { ...VALIDO, tipo: "promocao" },
      { ...VALIDO, link: "//evil.com" },
      { ...VALIDO, publico: "clientes" },
    ]) {
      expect(await publicarAviso(undefined, form(campos))).toMatchObject({ ok: false });
    }
    expect(chavesCriadas).toBe(0);
    expect(banco.tabelas.avisos_aos_clientes).toHaveLength(1);
  });
});

describe("encerrarAviso", () => {
  it("quem não administra é barrado antes da chave", async () => {
    guarda = { erro: NEGADO };
    expect(await encerrarAviso(AVISO)).toEqual({ ok: false, erro: NEGADO });
    expect(chavesCriadas).toBe(0);
    expect(banco.tabelas.avisos_aos_clientes[0].encerrado_em).toBeNull();
  });

  it("encerra pelo id; id inválido nem chega ao banco", async () => {
    expect(await encerrarAviso("1; drop table")).toMatchObject({ ok: false });
    expect(chavesCriadas).toBe(0);
    expect(await encerrarAviso(AVISO)).toMatchObject({ ok: true });
    expect(banco.tabelas.avisos_aos_clientes[0].encerrado_em).toEqual(expect.any(String));
  });
});
